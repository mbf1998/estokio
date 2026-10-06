/*
 * Fluxos de cadastro e acesso do Estokio (teste grátis, código de ativação, convite de equipe, renovação, remoção de membro,
 * registro de acesso), simulados como o app grava: um lote com várias gravações, avaliadas com o estado do banco DEPOIS do lote.
 * Mostra se o lote é permitido e quantas consultas a outros documentos ele gasta (limite do Firestore: 20 por lote).
 * Uso: node tools/regras/fluxos.js   (sai com código 1 se algum fluxo legítimo for negado ou algum abuso passar)
 */
'use strict';
const { sim, bancoBase, agora } = require('./matriz.js');
const { Ts } = require('./simulador.js');
const ts = (d = 0) => new Ts(Date.now() + d * 864e5);

function aplicarLote(antes, escritas) {
  const depois = new Map(antes);
  escritas.forEach((w) => { if (w.metodo === 'delete') depois.delete(w.caminho); else depois.set(w.caminho, w.dados); });
  return depois;
}
function avaliarLote(antes, escritas, auth) {
  const depois = aplicarLote(antes, escritas);
  let consultas = 0, tudo = true; const detalhe = [];
  for (const w of escritas) {
    const metodo = w.metodo || (antes.has(w.caminho) ? 'update' : 'create');
    const r = sim.avaliar({ metodo, caminho: w.caminho, dados: w.dados, auth, antes, depois, agora });
    consultas += r.consultas; tudo = tudo && r.permitido;
    detalhe.push({ caminho: w.caminho.replace(/^empresas\/(\w+)\//, '$1/'), metodo, permitido: r.permitido, consultas: r.consultas, erro: r.erros[0] });
  }
  return { permitido: tudo, consultas, detalhe };
}
const mescla = (db, p, extra) => ({ ...db.get(p), ...extra });

function cenarios() {
  const lista = [];
  const novaPessoa = { uid: 'u7', email: 'gael@novo.com' };
  // ---- 1) teste grátis
  const empresaTeste = (cnpj = '12345678000190') => ({ nome: 'Padaria Nova', cnpj, telefone: '8199999999', cidade: 'Recife', contatoNome: 'Gael', contatoEmail: novaPessoa.email, contatoTelefone: '8199999999',
    logo: null, corPrimaria: '#16233a', corDestaque: '#f2b705', ativo: true, configurado: false, donoUid: novaPessoa.uid, donoEmail: novaPessoa.email, totalUsuarios: 1, maxUsuarios: 5,
    planoId: 'teste', planoNome: 'Teste grátis', planoPreco: 0, planoDias: 7, maxProdutos: 0, recursos: { leitor: true, nfe: true, lotes: true }, pacotes: {}, origem: 'teste',
    acessoAte: ts(7), criadoEm: agora, ativadoEm: agora });
  const loteTeste = (cnpj) => [
    { caminho: 'empresas/eN', dados: empresaTeste(cnpj) },
    { caminho: 'empresas/eN/membros/u7', dados: { nome: 'Gael', email: novaPessoa.email, papel: 'dono', entrouEm: agora } },
    { caminho: 'usuarios/u7', dados: { empresaId: 'eN', papel: 'dono', email: novaPessoa.email, nome: 'Gael', criadoEm: agora } },
    { caminho: 'testes/' + novaPessoa.email, dados: { empresaId: 'eN', criadoEm: agora } },
    { caminho: 'cnpjs/' + cnpj, dados: { empresaId: 'eN', criadoEm: agora } }];
  lista.push({ nome: 'Criar conta e teste grátis (5 gravações)', ok: true, auth: novaPessoa, antes: bancoBase(), lote: loteTeste('12345678000190') });
  { const db = bancoBase(); db.set('cnpjs/12345678000190', { empresaId: 'eX' }); lista.push({ nome: 'Abuso: segundo teste com o mesmo CNPJ', ok: false, auth: novaPessoa, antes: db, lote: loteTeste('12345678000190') }); }
  { const db = bancoBase(); db.set('testes/' + novaPessoa.email, { empresaId: 'eX' }); lista.push({ nome: 'Abuso: segundo teste com o mesmo e-mail', ok: false, auth: novaPessoa, antes: db, lote: loteTeste('98765432000100') }); }
  // ---- 2) código EST (empresa criada pelo administrador)
  { const db = bancoBase(); const est = 'convites/EST-AAAA-BBBB-CCCC';
    db.set('empresas/eE', { nome: 'Cliente', ativo: true, donoUid: null, totalUsuarios: 0, maxUsuarios: 5, acessoAte: ts(1), recursos: {}, planoId: 'pro' });
    db.set(est, { tipo: 'empresa', empresaId: 'eE', status: 'pendente', dias: 30, validoAte: ts(5) });
    const lote = (conv = db.get(est)) => [
      { caminho: 'empresas/eE', dados: mescla(db, 'empresas/eE', { donoUid: 'u7', donoEmail: novaPessoa.email, conviteUsado: 'EST-AAAA-BBBB-CCCC', totalUsuarios: 1, ativadoEm: agora, acessoAte: ts(30) }) },
      { caminho: 'empresas/eE/membros/u7', dados: { nome: 'Gael', email: novaPessoa.email, papel: 'dono', convite: 'EST-AAAA-BBBB-CCCC', entrouEm: agora } },
      { caminho: est, dados: { ...conv, status: 'usado', usadoPor: 'u7', usadoEmail: novaPessoa.email, usadoEm: agora } },
      { caminho: 'usuarios/u7', dados: { empresaId: 'eE', papel: 'dono', email: novaPessoa.email, nome: 'Gael', criadoEm: agora } }];
    lista.push({ nome: 'Ativar empresa com código EST (4 gravações)', ok: true, auth: novaPessoa, antes: db, lote: lote() });
    const db2 = new Map(db); db2.set(est, { ...db.get(est), status: 'usado' });
    lista.push({ nome: 'Abuso: reutilizar um código EST já usado', ok: false, auth: novaPessoa, antes: db2, lote: lote(db2.get(est)) }); }
  // ---- 3) convite de equipe EQP
  { const db = bancoBase(); const eqp = 'convites/EQP-AAAA-BBBB-CCCC';
    db.set('empresas/e3', { nome: 'Loja 3', ativo: true, donoUid: 'u6', totalUsuarios: 3, maxUsuarios: 5, acessoAte: ts(10), recursos: {} });
    db.set(eqp, { tipo: 'membro', empresaId: 'e3', status: 'pendente', papel: 'caixa', criadoPor: 'u6', validoAte: ts(5) });
    const lote = (total, papel) => [
      { caminho: 'empresas/e3', dados: mescla(db, 'empresas/e3', { totalUsuarios: total }) },
      { caminho: 'empresas/e3/membros/u7', dados: { nome: 'Gael', email: novaPessoa.email, papel, convite: 'EQP-AAAA-BBBB-CCCC', entrouEm: agora } },
      { caminho: eqp, dados: { ...db.get(eqp), status: 'usado', usadoPor: 'u7', usadoEmail: novaPessoa.email, usadoEm: agora } },
      { caminho: 'usuarios/u7', dados: { empresaId: 'e3', papel, email: novaPessoa.email, nome: 'Gael', criadoEm: agora } }];
    lista.push({ nome: 'Entrar na equipe com código EQP (4 gravações)', ok: true, auth: novaPessoa, antes: db, lote: lote(4, 'caixa') });
    lista.push({ nome: 'Abuso: entrar na equipe com um papel melhor do que o do convite', ok: false, auth: novaPessoa, antes: db, lote: lote(4, 'gerente') });
    const cheio = new Map(db); cheio.set('empresas/e3', { ...db.get('empresas/e3'), totalUsuarios: 5 });
    lista.push({ nome: 'Abuso: entrar numa equipe que já está cheia', ok: false, auth: novaPessoa, antes: cheio, lote: [{ caminho: 'empresas/e3', dados: mescla(cheio, 'empresas/e3', { totalUsuarios: 6 }) }, ...lote(6, 'caixa').slice(1)] }); }
  // ---- 4) renovação REN
  { const db = bancoBase(); const ren = 'convites/REN-AAAA-BBBB-CCCC';
    db.set(ren, { tipo: 'renovacao', empresaId: 'e1', status: 'pendente', dias: 30, validoAte: ts(5) });
    const e1 = db.get('empresas/e1');
    const lote = (id, novoAte) => [
      { caminho: 'empresas/e1', dados: { ...e1, acessoAte: novoAte, ultimaRenovacao: id, renovadoEm: agora } },
      { caminho: ren, dados: { ...db.get(ren), status: 'usado', usadoPor: 'u1', usadoEmail: 'ana@loja.com', usadoEm: agora } }];
    lista.push({ nome: 'Renovar o acesso com código REN (2 gravações)', ok: true, auth: { uid: 'u1', email: 'ana@loja.com' }, antes: db, lote: lote('REN-AAAA-BBBB-CCCC', new Ts(e1.acessoAte.ms + 30 * 864e5)) });
    lista.push({ nome: 'Abuso: renovar por mais dias do que o código dá', ok: false, auth: { uid: 'u1', email: 'ana@loja.com' }, antes: db, lote: lote('REN-AAAA-BBBB-CCCC', new Ts(e1.acessoAte.ms + 300 * 864e5)) });
    lista.push({ nome: 'Abuso: o gerente tentar aplicar o código REN', ok: false, auth: { uid: 'u3', email: 'carla@loja.com' }, antes: db, lote: lote('REN-AAAA-BBBB-CCCC', new Ts(e1.acessoAte.ms + 30 * 864e5)) }); }
  // ---- 5) remover membro
  { const db = bancoBase(); db.set('usuarios/u5', { empresaId: 'e1', papel: 'estoquista', email: 'eva@loja.com' });
    const lote = () => [
      { metodo: 'delete', caminho: 'empresas/e1/membros/u5' }, { metodo: 'delete', caminho: 'usuarios/u5' },
      { caminho: 'empresas/e1', dados: mescla(db, 'empresas/e1', { totalUsuarios: 4, ultimoRemovido: 'u5' }) }];
    lista.push({ nome: 'Responsável remove alguém da equipe (3 gravações)', ok: true, auth: { uid: 'u1', email: 'ana@loja.com' }, antes: db, lote: lote() });
    lista.push({ nome: 'Abuso: o gerente remover alguém da equipe', ok: false, auth: { uid: 'u3', email: 'carla@loja.com' }, antes: db, lote: lote() }); }
  // ---- 6) registrar acesso
  { const db = bancoBase();
    for (const [uid, email, rotulo] of [['u1', 'ana@loja.com', 'responsável'], ['u4', 'davi@loja.com', 'caixa']]) {
      lista.push({ nome: `Registrar o último acesso (${rotulo}, 2 gravações)`, ok: true, auth: { uid, email }, antes: db, lote: [
        { caminho: 'empresas/e1', dados: mescla(db, 'empresas/e1', { ultimoAcesso: agora }) },
        { caminho: 'empresas/e1/membros/' + uid, dados: mescla(db, 'empresas/e1/membros/' + uid, { ultimoAcesso: agora }) }] }); } }
  return lista;
}

function rodar() { return cenarios().map((c) => ({ ...c, ...avaliarLote(c.antes, c.lote, c.auth) })); }

if (require.main === module) {
  const res = rodar(); let falhas = 0;
  console.log('\nFLUXOS DE CADASTRO E ACESSO (como o app grava: um lote por fluxo)\n');
  for (const r of res) {
    const certo = r.permitido === r.ok;
    if (!certo) falhas++;
    const marca = certo ? 'ok ' : 'ERRO';
    console.log(`${marca} ${r.nome.padEnd(72)} ${r.permitido ? 'PERMITIDO' : 'NEGADO   '}  consultas no lote: ${String(r.consultas).padStart(2)}${r.consultas > 20 ? '  <-- ACIMA DO LIMITE DE 20' : ''}`);
    if (!certo || process.argv.includes('--detalhe')) r.detalhe.forEach((d) => console.log(`        ${d.permitido ? ' ok ' : 'nega'} ${d.metodo.padEnd(6)} ${d.caminho.padEnd(40)} ${d.consultas} consultas${d.erro ? '  (' + d.erro + ')' : ''}`));
  }
  const acima = res.filter((r) => r.ok && r.consultas > 20).length;
  console.log(`\nFluxos com resultado inesperado: ${falhas} | Fluxos legítimos acima do limite de consultas: ${acima}\n`);
  process.exitCode = falhas || acima ? 1 : 0;
}
module.exports = { rodar };
