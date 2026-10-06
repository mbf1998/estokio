/*
 * Estokio — matriz de papéis e permissões, calculada a partir das regras reais (firestore.rules).
 * Uso:  node tools/regras/matriz.js            (imprime a matriz e o orçamento de consultas por lote)
 *       node tools/regras/matriz.js --json x   (grava o resultado em x.json)
 * Sai com código 1 se alguma regra deixar passar quem NÃO deveria (estranho ou visitante) ou negar quem deveria.
 */
'use strict';
const fs = require('fs'), path = require('path');
const { criarSimulador, Ts } = require('./simulador.js');
const sim = criarSimulador(fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'));

const agora = new Ts(Date.now());
const futuro = new Ts(Date.now() + 10 * 864e5);
const ts = (d = 0) => new Ts(Date.now() + d * 864e5);
const ROTULO = { dono: 'Responsável', gerente: 'Gerente', estoquista: 'Estoquista', caixa: 'Caixa' };
const PAPEIS = ['dono', 'gerente', 'estoquista', 'caixa'];
const PESSOA = { dono: { uid: 'u1', email: 'ana@loja.com' }, gerente: { uid: 'u3', email: 'carla@loja.com' }, estoquista: { uid: 'u2', email: 'bruno@loja.com' }, caixa: { uid: 'u4', email: 'davi@loja.com' },
  estranho: { uid: 'u9', email: 'zeca@outra.com' }, visitante: null };

function bancoBase(recursosEmpresa) {
  const db = new Map();
  const rec = recursosEmpresa || { leitor: true, importacao: true, compras: true, nfe: true, lotes: true, grade: true, kits: true, etiquetas: true, relatorios: true, multiloja: true };
  db.set('admins/adm', {});
  db.set('empresas/e1', { nome: 'Loja', ativo: true, donoUid: 'u1', donoEmail: 'ana@loja.com', acessoAte: futuro, maxUsuarios: 5, totalUsuarios: 5, planoId: 'premium', recursos: rec, origem: 'teste' });
  db.set('empresas/e2', { nome: 'Outra', ativo: true, donoUid: 'u9', acessoAte: futuro, maxUsuarios: 5, totalUsuarios: 1, recursos: rec });
  const m = (papel, email) => ({ nome: papel, email, papel, entrouEm: ts(-5) });
  db.set('empresas/e1/membros/u1', m('dono', 'ana@loja.com')); db.set('empresas/e1/membros/u3', m('gerente', 'carla@loja.com'));
  db.set('empresas/e1/membros/u2', m('estoquista', 'bruno@loja.com')); db.set('empresas/e1/membros/u4', m('caixa', 'davi@loja.com'));
  db.set('empresas/e1/membros/u5', m('estoquista', 'eva@loja.com'));
  db.set('empresas/e2/membros/u9', m('dono', 'zeca@outra.com'));
  db.set('empresas/e1/produtos/p1', { nome: 'Água', sku: 'A1', unidade: 'un', preco: 2, estoqueMinimo: 3, quantidade: 10, criadoEm: ts(-9), atualizadoEm: ts(-1) });
  db.set('empresas/e1/custos/p1', { custo: 1, atualizadoEm: ts(-9) });
  db.set('empresas/e1/movimentacoes/m1', { produtoId: 'p1', tipo: 'entrada', quantidade: 10, usuario: 'ana@loja.com', criadoEm: ts(-9) });
  db.set('empresas/e1/fornecedores/f1', { nome: 'Atacado', criadoEm: ts(-9) });
  db.set('empresas/e1/categorias/c1', { nome: 'Bebidas', criadoEm: ts(-9) });
  db.set('empresas/e1/pedidosCompra/pc1', { numero: 1, status: 'aberto', fornecedorId: 'f1', itens: [{ produtoId: 'p1', qtd: 5, recebido: 0 }], criadoEm: ts(-2) });
  db.set('empresas/e1/solicitacoes/s1', { produtoId: 'p1', quantidade: 8, status: 'pendente', solicitadoPor: 'bruno@loja.com' });
  db.set('empresas/e1/inventarios/i1', { nome: 'Inv', status: 'aberto', contagens: {}, criadoEm: ts(-1) });
  db.set('empresas/e1/grades/g1', { nome: 'Camisa' }); db.set('empresas/e1/locais/l1', { nome: 'Depósito' });
  db.set('pedidos/px1', { tipo: 'plano', empresaId: 'e1', status: 'aguardando', valor: 59.9, criadoPor: 'ana@loja.com' });
  return db;
}

// atalhos de quem a TELA deixa fazer: [Responsável, Gerente, Estoquista, Caixa]
const TODOS = [1, 1, 1, 1], ESTOQUE = [1, 1, 1, 0], GERIR = [1, 1, 0, 0], DONO = [1, 0, 0, 0], NINGUEM = [0, 0, 0, 0];
const E = 'empresas/e1/';
const merge = (db, p, parcial) => ({ ...db.get(p), ...parcial });
const prodNovo = (email) => ({ nome: 'Café', sku: '', codigoBarras: '', categoriaId: '', fornecedorId: '', unidade: 'un', localizacao: '', preco: 5, estoqueMinimo: 2, descricao: '', quantidade: 3, criadoEm: agora, atualizadoEm: agora, criadoPor: email });
const mov = (tipo, email) => ({ produtoId: 'p1', produtoNome: 'Água', sku: 'A1', tipo, quantidade: 2, antes: 10, depois: 8, usuario: email, criadoEm: agora });

// cada ação: grupo, nome, op(db, pessoa) -> {metodo, caminho, dados}, ui (quem a tela deixa), onde (como a tela trata), nota
const ACOES = [
  // ---------------- leitura ----------------
  { g: 'Ver', n: 'Ver produtos e saldos', op: () => ({ metodo: 'get', caminho: E + 'produtos/p1' }), ui: TODOS },
  { g: 'Ver', n: 'Ver preço de custo', op: () => ({ metodo: 'get', caminho: E + 'custos/p1' }), ui: GERIR, nota: 'O custo fica em registro separado; para estoquista e caixa nem chega ao navegador.' },
  { g: 'Ver', n: 'Ver histórico de movimentações', op: () => ({ metodo: 'get', caminho: E + 'movimentacoes/m1' }), ui: TODOS },
  { g: 'Ver', n: 'Ver fornecedores', op: () => ({ metodo: 'get', caminho: E + 'fornecedores/f1' }), ui: ESTOQUE, nota: 'A tela esconde de caixa; as regras deixam qualquer membro LER (só leitura).' },
  { g: 'Ver', n: 'Ver pedidos de compra', op: () => ({ metodo: 'get', caminho: E + 'pedidosCompra/pc1' }), ui: ESTOQUE, nota: 'Idem: o caixa não vê a tela, mas pode ler pela API.' },
  { g: 'Ver', n: 'Ver ajustes aguardando aprovação', op: () => ({ metodo: 'get', caminho: E + 'solicitacoes/s1' }), ui: GERIR },
  { g: 'Ver', n: 'Ver inventários', op: () => ({ metodo: 'get', caminho: E + 'inventarios/i1' }), ui: ESTOQUE },
  { g: 'Ver', n: 'Ver a equipe (nomes e e-mails)', op: () => ({ metodo: 'get', caminho: E + 'membros/u2' }), ui: DONO, nota: 'O app lê a lista para saber o papel de cada um; qualquer membro consegue ler nomes e e-mails da equipe.' },
  { g: 'Ver', n: 'Ver pedidos de pagamento (Pix)', op: () => ({ metodo: 'get', caminho: 'pedidos/px1' }), ui: DONO },
  // ---------------- produtos ----------------
  { g: 'Produtos', n: 'Cadastrar produto', op: (db, p) => ({ metodo: 'create', caminho: E + 'produtos/p2', dados: prodNovo(p.email) }), ui: ESTOQUE },
  { g: 'Produtos', n: 'Editar produto (nome, preço, mínimo)', op: (db) => ({ metodo: 'update', caminho: E + 'produtos/p1', dados: merge(db, E + 'produtos/p1', { nome: 'Água 500', preco: 3, atualizadoEm: agora }) }), ui: ESTOQUE },
  { g: 'Produtos', n: 'Baixar ou somar saldo (efeito de uma venda ou entrada)', op: (db) => ({ metodo: 'update', caminho: E + 'produtos/p1', dados: merge(db, E + 'produtos/p1', { quantidade: 8, atualizadoEm: agora }) }), ui: TODOS, nota: 'O caixa precisa disso para registrar saídas: só os campos de saldo.' },
  { g: 'Produtos', n: 'Excluir produto', op: () => ({ metodo: 'delete', caminho: E + 'produtos/p1' }), ui: GERIR },
  { g: 'Produtos', n: 'Gravar preço de custo', op: () => ({ metodo: 'update', caminho: E + 'custos/p1', dados: { custo: 2, atualizadoEm: agora } }), ui: GERIR },
  { g: 'Produtos', n: 'Mexer no custo pelo documento do produto (tentativa por fora)', op: (db) => ({ metodo: 'update', caminho: E + 'produtos/p1', dados: merge(db, E + 'produtos/p1', { custo: 0.01, atualizadoEm: agora }) }), ui: GERIR, nota: 'A tela não faz isso mais; a regra segue barrando quem não pode.' },
  { g: 'Produtos', n: 'Criar categoria', op: () => ({ metodo: 'create', caminho: E + 'categorias/c2', dados: { nome: 'Limpeza', criadoEm: agora } }), ui: ESTOQUE },
  { g: 'Produtos', n: 'Excluir categoria', op: () => ({ metodo: 'delete', caminho: E + 'categorias/c1' }), ui: ESTOQUE },
  { g: 'Produtos', n: 'Importar planilha (cria produtos em lote)', op: (db, p) => ({ metodo: 'create', caminho: E + 'produtos/p3', dados: prodNovo(p.email) }), ui: GERIR, nota: 'A tela da importação é de gerente e responsável; a regra de criar produto é de qualquer um que não seja caixa.' },
  { g: 'Produtos', n: 'Lançar entrada por NF-e', op: (db, p) => ({ metodo: 'create', caminho: E + 'notas/n1', dados: { chave: 'n1', lancadaPor: p.email, criadoEm: agora } }), ui: GERIR, nota: 'Idem: a tela é de gerente e responsável; a regra deixa o estoquista.' },
  { g: 'Produtos', n: 'Criar grade (tamanho e cor)', op: () => ({ metodo: 'create', caminho: E + 'grades/g2', dados: { nome: 'Calça' } }), ui: ESTOQUE, nota: 'A regra só pede "ser membro": o caixa conseguiria gravar pela API.' },
  { g: 'Produtos', n: 'Criar etiqueta, kit ou grade em plano sem o recurso', op: null, ui: NINGUEM, ignorar: true },
  // ---------------- estoque ----------------
  { g: 'Estoque', n: 'Registrar entrada', op: (db, p) => ({ metodo: 'create', caminho: E + 'movimentacoes/m2', dados: mov('entrada', p.email) }), ui: ESTOQUE },
  { g: 'Estoque', n: 'Registrar saída', op: (db, p) => ({ metodo: 'create', caminho: E + 'movimentacoes/m3', dados: mov('saida', p.email) }), ui: TODOS },
  { g: 'Estoque', n: 'Ajuste direto de inventário', op: (db, p) => ({ metodo: 'create', caminho: E + 'movimentacoes/m4', dados: mov('ajuste', p.email) }), ui: GERIR, nota: 'Estoquista pede o ajuste; gerente ou responsável aprova.' },
  { g: 'Estoque', n: 'Transferir entre locais', op: (db, p) => ({ metodo: 'create', caminho: E + 'movimentacoes/m5', dados: mov('transferencia', p.email) }), ui: ESTOQUE },
  { g: 'Estoque', n: 'Pedir ajuste (vai para aprovação)', op: (db, p) => ({ metodo: 'create', caminho: E + 'solicitacoes/s2', dados: { produtoId: 'p1', quantidade: 7, status: 'pendente', solicitadoPor: p.email, criadoEm: agora } }), ui: [1, 1, 1, 0], nota: 'Na tela só o estoquista usa; responsável e gerente ajustam direto.' },
  { g: 'Estoque', n: 'Aprovar ou recusar ajuste', op: (db) => ({ metodo: 'update', caminho: E + 'solicitacoes/s1', dados: merge(db, E + 'solicitacoes/s1', { status: 'aprovado' }) }), ui: GERIR },
  { g: 'Estoque', n: 'Editar ou apagar uma movimentação já feita', op: (db) => ({ metodo: 'update', caminho: E + 'movimentacoes/m1', dados: merge(db, E + 'movimentacoes/m1', { quantidade: 99 }) }), ui: NINGUEM, nota: 'O histórico é imutável para todos (só o administrador do Estokio apaga, ao excluir uma empresa).' },
  { g: 'Estoque', n: 'Abrir inventário', op: (db, p) => ({ metodo: 'create', caminho: E + 'inventarios/i2', dados: { nome: 'Novo', status: 'aberto', contagens: {}, criadoPor: p.email, criadoEm: agora } }), ui: GERIR },
  { g: 'Estoque', n: 'Contar itens do inventário', op: (db) => ({ metodo: 'update', caminho: E + 'inventarios/i1', dados: merge(db, E + 'inventarios/i1', { contagens: { p1: { qtd: 9 } }, atualizadoEm: agora }) }), ui: ESTOQUE },
  { g: 'Estoque', n: 'Concluir inventário', op: (db) => ({ metodo: 'update', caminho: E + 'inventarios/i1', dados: merge(db, E + 'inventarios/i1', { status: 'concluido', atualizadoEm: agora }) }), ui: GERIR, nota: 'Mesma regra de "contar": a tela reserva ao gerente, a regra deixa o estoquista.' },
  { g: 'Estoque', n: 'Criar local (loja ou depósito)', op: () => ({ metodo: 'create', caminho: E + 'locais/l2', dados: { nome: 'Loja 2' } }), ui: ESTOQUE, nota: 'A regra só pede "ser membro": o caixa conseguiria gravar pela API.' },
  // ---------------- compras ----------------
  { g: 'Compras', n: 'Criar pedido de compra', op: (db, p) => ({ metodo: 'create', caminho: E + 'pedidosCompra/pc2', dados: { numero: 2, status: 'aberto', fornecedorId: 'f1', itens: [{ produtoId: 'p1', qtd: 5, recebido: 0 }], criadoPor: p.email, criadoEm: agora } }), ui: ESTOQUE },
  { g: 'Compras', n: 'Receber pedido (lança as entradas)', op: (db) => ({ metodo: 'update', caminho: E + 'pedidosCompra/pc1', dados: merge(db, E + 'pedidosCompra/pc1', { status: 'recebido', diasEntrega: 3, atualizadoEm: agora }) }), ui: ESTOQUE },
  { g: 'Compras', n: 'Cancelar pedido de compra', op: (db) => ({ metodo: 'update', caminho: E + 'pedidosCompra/pc1', dados: merge(db, E + 'pedidosCompra/pc1', { status: 'cancelado' }) }), ui: GERIR, nota: 'A tela reserva o botão ao gerente; a regra de atualizar pedido deixa o estoquista.' },
  { g: 'Compras', n: 'Excluir pedido de compra', op: () => ({ metodo: 'delete', caminho: E + 'pedidosCompra/pc1' }), ui: GERIR },
  { g: 'Compras', n: 'Cadastrar fornecedor (com prazo de entrega)', op: () => ({ metodo: 'create', caminho: E + 'fornecedores/f2', dados: { nome: 'Novo forn.', prazoEntrega: 4, criadoEm: agora } }), ui: ESTOQUE },
  { g: 'Compras', n: 'Excluir fornecedor', op: () => ({ metodo: 'delete', caminho: E + 'fornecedores/f1' }), ui: ESTOQUE },
  // ---------------- empresa e equipe ----------------
  { g: 'Empresa', n: 'Convidar alguém para a equipe', op: (db, p) => ({ metodo: 'create', caminho: 'convites/EQP-AAAA-BBBB-CCCC', dados: { tipo: 'membro', empresaId: 'e1', status: 'pendente', papel: 'caixa', criadoPor: p.uid, validoAte: ts(7) } }), ui: DONO },
  { g: 'Empresa', n: 'Mudar o papel de alguém', op: (db) => ({ metodo: 'update', caminho: E + 'membros/u5', dados: merge(db, E + 'membros/u5', { papel: 'gerente' }) }), ui: DONO },
  { g: 'Empresa', n: 'Remover alguém da equipe', op: () => ({ metodo: 'delete', caminho: E + 'membros/u5' }), ui: DONO },
  { g: 'Empresa', n: 'Editar dados e aparência da empresa', op: (db) => ({ metodo: 'update', caminho: 'empresas/e1', dados: merge(db, 'empresas/e1', { nome: 'Loja Nova', atualizadoEm: agora }) }), ui: DONO },
  { g: 'Empresa', n: 'Mudar plano ou limites da própria empresa (por fora)', op: (db) => ({ metodo: 'update', caminho: 'empresas/e1', dados: merge(db, 'empresas/e1', { planoId: 'premium', maxUsuarios: 99, atualizadoEm: agora }) }), ui: NINGUEM, nota: 'Só o administrador do Estokio muda plano e limites.' },
  { g: 'Empresa', n: 'Gerar pedido de pagamento (Pix)', op: (db, p) => ({ metodo: 'create', caminho: 'pedidos/px2', dados: { tipo: 'plano', empresaId: 'e1', status: 'aguardando', valor: 161.9, criadoPor: p.email, criadoEm: agora } }), ui: DONO },
  { g: 'Empresa', n: 'Cancelar o próprio pedido de pagamento', op: (db) => ({ metodo: 'update', caminho: 'pedidos/px1', dados: merge(db, 'pedidos/px1', { status: 'cancelado', canceladoEm: agora }) }), ui: DONO },
  { g: 'Empresa', n: 'Registrar o próprio último acesso', op: (db, p) => ({ metodo: 'update', caminho: E + 'membros/' + p.uid, dados: merge(db, E + 'membros/' + p.uid, { ultimoAcesso: agora }) }), ui: TODOS, usaAgora: true },
];

function rodar(recursos) {
  const resultados = [];
  for (const a of ACOES) {
    if (a.ignorar) continue;
    const linha = { grupo: a.g, acao: a.n, nota: a.nota || '', tela: {}, regras: {}, consultas: {}, consultasUnicas: {}, estranho: false, visitante: false, erros: {} };
    const db = bancoBase(recursos);
    PAPEIS.forEach((papel, i) => {
      const p = PESSOA[papel];
      const op = a.op(db, p);
      const r = sim.avaliar({ ...op, auth: p, antes: db, agora });
      linha.tela[papel] = Boolean(a.ui[i]); linha.regras[papel] = r.permitido; linha.consultas[papel] = r.consultas; linha.consultasUnicas[papel] = r.consultasUnicas;
      if (r.erros.length) linha.erros[papel] = r.erros[0];
    });
    // quem não é da empresa e quem não entrou nunca podem
    for (const quem of ['estranho', 'visitante']) {
      const op = a.op(db, PESSOA.dono);
      linha[quem] = sim.avaliar({ ...op, auth: PESSOA[quem], antes: db, agora }).permitido;
    }
    resultados.push(linha);
  }
  return resultados;
}

if (require.main === module) {
  const res = rodar();
  const marca = (b) => (b ? 'sim' : '--');
  console.log('\nMATRIZ DE PAPÉIS E PERMISSÕES (as regras são o que vale; a tela é só o que ela mostra)\n');
  console.log('Legenda: cada papel mostra  REGRA/TELA  (sim = pode, -- = não pode). "!" = divergência.\n');
  let grupo = '', divergencias = 0, graves = 0, quebras = 0;
  console.log(`${'Ação'.padEnd(62)} ${PAPEIS.map((p) => ROTULO[p].slice(0, 9).padEnd(10)).join('')} Estranho Visitante`);
  for (const l of res) {
    if (l.grupo !== grupo) { grupo = l.grupo; console.log(`\n== ${grupo}`); }
    let linha = l.acao.slice(0, 61).padEnd(62);
    for (const p of PAPEIS) {
      const dif = l.regras[p] !== l.tela[p];
      if (dif) divergencias++;
      if (l.tela[p] && !l.regras[p]) quebras++;   // a tela oferece e a regra nega: o usuário veria "sem permissão"
      linha += (`${marca(l.regras[p])}/${marca(l.tela[p])}${dif ? '!' : ' '}`).padEnd(10);
    }
    if (l.estranho || l.visitante) graves++;
    linha += `${l.estranho ? 'PASSA!' : '--'}`.padEnd(9) + `${l.visitante ? 'PASSA!' : '--'}`;
    console.log(linha);
  }
  console.log(`\nDivergências entre tela e regras: ${divergencias} (regra mais permissiva que a tela) | A tela oferece e a regra nega: ${quebras} | Brechas para estranhos ou visitantes: ${graves}`);
  if (process.argv.includes('--json')) fs.writeFileSync(process.argv[process.argv.indexOf('--json') + 1] + '.json', JSON.stringify(res, null, 1));
  process.exitCode = graves || quebras ? 1 : 0;
}
module.exports = { rodar, bancoBase, ACOES, PESSOA, PAPEIS, ROTULO, sim, agora };
