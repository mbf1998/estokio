/*
 * Estokio — testes das regras do Firestore contra o EMULADOR OFICIAL do Firebase.
 *
 * Diferença para tools/regras/matriz.js e fluxos.js: aqueles usam um simulador que eu mesmo escrevi (rápido,
 * sem instalar nada, mas não é o Firestore de verdade). Este arquivo usa a biblioteca oficial da Google
 * (@firebase/rules-unit-testing) contra o emulador real — é a forma correta de ter certeza de que as regras
 * valem, mas precisa do emulador instalado e rodando.
 *
 * Como rodar (uma vez: `npm install`, depois sempre que quiser conferir as regras):
 *
 *   npm run testar:emulador
 *
 * Isso chama `firebase emulators:exec`, que sobe o emulador do Firestore, roda este arquivo com o Node
 * normal (sem framework de teste: cada check() imprime OK/FALHA sozinho) e desliga o emulador no final.
 * Precisa do Java instalado (o emulador roda em Java) e do firebase-tools (`npm install` já traz, pela
 * devDependency do projeto).
 *
 * Cobertura: não é um substituto para tools/regras/matriz.js (45 ações) e fluxos.js (15 fluxos) — é uma
 * amostra das partes mais importantes, pensada para o Firestore de verdade: isolamento entre empresas,
 * papéis, teste grátis duplicado, e os dois registros mais novos (aceite dos termos e pedido de exclusão),
 * que nunca foram testados contra um Firebase real.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, Timestamp } = require('firebase/firestore');

const AGORA = Date.now();
const futuro = () => Timestamp.fromMillis(AGORA + 10 * 86400000);
// O teste grátis exige acessoAte <= request.time + 7 dias + 1 hora (ver criarTeste() em firestore.rules); uso exatamente 7 dias.
const seteDias = () => Timestamp.fromMillis(AGORA + 7 * 86400000);
let ok = 0, total = 0, falhas = [];

/** Confirma que a promessa é aceita pelas regras; registra OK/FALHA sem derrubar o restante dos testes. */
async function esperaSucesso(nome, promessa) {
  total++;
  try { await assertSucceeds(promessa); ok++; console.log(`OK    ${nome}`); }
  catch (e) { falhas.push(nome); console.log(`FALHA ${nome}\n       ${String(e.message || e).slice(0, 200)}`); }
}
/** Confirma que a promessa é recusada pelas regras (como deveria); registra OK/FALHA. */
async function esperaFalha(nome, promessa) {
  total++;
  try { await assertFails(promessa); ok++; console.log(`OK    ${nome} (recusado, como esperado)`); }
  catch (e) { falhas.push(nome); console.log(`FALHA ${nome}\n       deveria ter sido recusado, mas passou`); }
}

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: 'estokio-teste-regras',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 }
  });

  // ---------- dados de partida, gravados direto (sem passar pelas regras) ----------
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins/adm1'), {});
    await setDoc(doc(db, 'empresas/e1'), { nome: 'Loja A', ativo: true, donoUid: 'u1', donoEmail: 'ana@lojaa.com', acessoAte: futuro(), maxUsuarios: 5, recursos: {} });
    await setDoc(doc(db, 'empresas/e1/membros/u1'), { papel: 'dono', email: 'ana@lojaa.com' });
    await setDoc(doc(db, 'empresas/e1/membros/u2'), { papel: 'caixa', email: 'davi@lojaa.com' });
    await setDoc(doc(db, 'empresas/e1/membros/u3'), { papel: 'gerente', email: 'carla@lojaa.com' });
    await setDoc(doc(db, 'empresas/e1/produtos/p1'), { nome: 'Água', unidade: 'un', preco: 2, estoqueMinimo: 3, quantidade: 10 });
    await setDoc(doc(db, 'empresas/e1/custos/p1'), { custo: 1 });
    await setDoc(doc(db, 'empresas/e2'), { nome: 'Loja B (outra empresa)', ativo: true, donoUid: 'u9', acessoAte: futuro(), maxUsuarios: 5, recursos: {} });
    await setDoc(doc(db, 'empresas/e2/membros/u9'), { papel: 'dono', email: 'zeca@lojab.com' });
    await setDoc(doc(db, 'empresas/e2/produtos/p9'), { nome: 'Produto da outra loja', unidade: 'un', preco: 1, estoqueMinimo: 1, quantidade: 5 });
    await setDoc(doc(db, 'cnpjs/11111111000100'), { empresaId: 'e1' });
  });

  const dono = testEnv.authenticatedContext('u1', { email: 'ana@lojaa.com' });
  const caixa = testEnv.authenticatedContext('u2', { email: 'davi@lojaa.com' });
  const gerente = testEnv.authenticatedContext('u3', { email: 'carla@lojaa.com' });
  const estranho = testEnv.authenticatedContext('u9', { email: 'zeca@lojab.com' });
  const visitante = testEnv.unauthenticatedContext();
  const admin = testEnv.authenticatedContext('adm1', { email: 'admin@estokio.com' });

  console.log('\n== Isolamento entre empresas ==');
  await esperaSucesso('dono lê um produto da própria empresa', getDoc(doc(dono.firestore(), 'empresas/e1/produtos/p1')));
  await esperaFalha('estranho (dono da Loja B) lê produto da Loja A', getDoc(doc(estranho.firestore(), 'empresas/e1/produtos/p1')));
  await esperaFalha('visitante sem login lê produto da Loja A', getDoc(doc(visitante.firestore(), 'empresas/e1/produtos/p1')));
  await esperaFalha('estranho tenta gravar saldo num produto da Loja A', setDoc(doc(estranho.firestore(), 'empresas/e1/produtos/p1'), { nome: 'Água', unidade: 'un', preco: 2, estoqueMinimo: 3, quantidade: 999 }));

  console.log('\n== Papéis dentro da mesma empresa ==');
  await esperaFalha('caixa lê o preço de custo', getDoc(doc(caixa.firestore(), 'empresas/e1/custos/p1')));
  await esperaSucesso('gerente lê o preço de custo', getDoc(doc(gerente.firestore(), 'empresas/e1/custos/p1')));
  await esperaFalha('caixa registra uma entrada de estoque', setDoc(doc(caixa.firestore(), 'empresas/e1/movimentacoes/m1'), { tipo: 'entrada', quantidade: 5, usuario: 'davi@lojaa.com' }));
  await esperaSucesso('caixa registra uma saída (venda)', setDoc(doc(caixa.firestore(), 'empresas/e1/movimentacoes/m2'), { tipo: 'saida', quantidade: 1, usuario: 'davi@lojaa.com' }));
  await esperaFalha('ninguém edita uma movimentação já gravada', updateDoc(doc(dono.firestore(), 'empresas/e1/movimentacoes/m2'), { quantidade: 99 }));

  console.log('\n== Teste grátis: um por CNPJ (lote com os 5 documentos, igual ao app) ==');
  // criarTeste() usa existsAfter() nos documentos de testes/ e cnpjs/: só funciona num lote que grava os dois
  // junto com a empresa, exatamente como o app faz de verdade (ver DB.criarTeste em public/app/js/db.js).
  async function loteTeste(uid, email, cnpj, empresaId) {
    const db = testEnv.authenticatedContext(uid, { email }).firestore();
    const b = writeBatch(db);
    b.set(doc(db, `empresas/${empresaId}`), {
      nome: 'Empresa Nova', cnpj, telefone: '', cidade: '', contatoNome: '', contatoEmail: email, contatoTelefone: '',
      logo: null, corPrimaria: null, corDestaque: null, ativo: true, configurado: false, donoUid: uid, donoEmail: email,
      totalUsuarios: 1, maxUsuarios: 5, planoId: 'teste', planoNome: 'Teste grátis', planoPreco: 0, planoDias: 7, maxProdutos: 0,
      recursos: {}, pacotes: {}, origem: 'teste', acessoAte: seteDias(), criadoEm: serverTimestamp(), ativadoEm: serverTimestamp()
    });
    b.set(doc(db, `empresas/${empresaId}/membros/${uid}`), { nome: 'Gael', email, papel: 'dono', entrouEm: serverTimestamp() });
    b.set(doc(db, `usuarios/${uid}`), { empresaId, papel: 'dono', email, nome: 'Gael', criadoEm: serverTimestamp() });
    b.set(doc(db, `testes/${email}`), { empresaId, criadoEm: serverTimestamp() });
    b.set(doc(db, `cnpjs/${cnpj}`), { empresaId, criadoEm: serverTimestamp() });
    return b.commit();
  }
  await esperaSucesso('cria conta e teste grátis, lote com os 5 documentos', loteTeste('u7', 'gael@novo.com', '22222222000100', 'eNovoU7'));
  await esperaFalha('tenta criar um 2º teste grátis com o mesmo CNPJ', loteTeste('u8', 'outra@novo.com', '11111111000100', 'eNovoU8'));

  console.log('\n== Prova de aceite dos termos (não pode forjar a data) ==');
  await esperaSucesso('cria o próprio aceite, com a hora do servidor', setDoc(doc(dono.firestore(), 'aceites/u1'), { uid: 'u1', email: 'ana@lojaa.com', versao: '2.0', aceitoEm: serverTimestamp() }));
  await esperaFalha('tenta criar o aceite com uma data forjada (não é a do servidor)', setDoc(doc(gerente.firestore(), 'aceites/u3'), { uid: 'u3', email: 'carla@lojaa.com', versao: '2.0', aceitoEm: Timestamp.fromMillis(AGORA - 999999) }));
  await esperaFalha('tenta ler o aceite de outra pessoa', getDoc(doc(gerente.firestore(), 'aceites/u1')));

  console.log('\n== Pedido de exclusão (LGPD) ==');
  await esperaSucesso('o responsável pede a exclusão da empresa', updateDoc(doc(dono.firestore(), 'empresas/e1'), { pedidoExclusao: { solicitadoPor: 'ana@lojaa.com', solicitadoEm: serverTimestamp(), motivo: 'Teste' } }));
  await esperaFalha('o gerente (não é o responsável) tenta pedir a exclusão', updateDoc(doc(gerente.firestore(), 'empresas/e1'), { pedidoExclusao: { solicitadoPor: 'carla@lojaa.com', solicitadoEm: serverTimestamp(), motivo: 'Teste' } }));

  console.log('\n== Administrador ==');
  await esperaSucesso('admin lê um produto de qualquer empresa', getDoc(doc(admin.firestore(), 'empresas/e2/produtos/p9')));
  await esperaSucesso('admin exclui uma empresa', deleteDoc(doc(admin.firestore(), 'empresas/e2')));
  await esperaFalha('dono de uma empresa tenta excluir a própria empresa (só o admin pode)', deleteDoc(doc(dono.firestore(), 'empresas/e1')));

  await testEnv.cleanup();

  console.log(`\n${ok} de ${total} testes corretos.`);
  if (falhas.length) { console.log('Falharam:', falhas.join(', ')); process.exitCode = 1; }
}

main().catch((e) => { console.error('Erro ao rodar os testes:', e); process.exitCode = 1; });
