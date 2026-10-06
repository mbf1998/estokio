/*
 * Orçamento de consultas por lote.
 * O Firestore deixa as regras consultar outros documentos (get/exists) no máximo 20 vezes por lote ou transação
 * (e 10 por gravação). Cada gravação do Estokio gasta algumas consultas só para saber quem é a pessoa e se a
 * empresa está ativa. Este script mede esse custo nas regras atuais e diz quantos itens cabem em cada fluxo.
 * Não se sabe com certeza se o Firestore conta de novo uma consulta ao mesmo documento em gravações diferentes
 * do mesmo lote; por isso calculamos o pior caso (contando tudo) e o melhor caso (documentos únicos por gravação).
 */
'use strict';
const { rodar } = require('./matriz.js');
const LIMITE_LOTE = 20, LIMITE_GRAVACAO = 10;

function medir() {
  const res = rodar();
  const achar = (nome) => res.find((r) => r.acao.startsWith(nome));
  // consultas de cada tipo de gravação: maior valor entre os papéis que podem fazê-la
  const custo = (nome, quem = ['dono', 'gerente', 'estoquista', 'caixa']) => {
    const r = achar(nome);
    const v = quem.filter((p) => r.regras[p]).map((p) => r.consultas[p]);
    const u = quem.filter((p) => r.regras[p]).map((p) => r.consultasUnicas[p]);
    return { pior: Math.max(...v), melhor: Math.max(...u) };
  };
  return {
    produtoCriar: custo('Cadastrar produto'), produtoSaldo: custo('Baixar ou somar saldo'), custo: custo('Gravar preço de custo'),
    movEntrada: custo('Registrar entrada'), movSaida: custo('Registrar saída'), categoria: custo('Criar categoria'),
    fornecedor: custo('Cadastrar fornecedor'), pedidoReceber: custo('Receber pedido'), grade: custo('Criar grade'), nota: custo('Lançar entrada por NF-e')
  };
}

// fluxos do app: lista de gravações por "item" e fixas
function fluxos(c) {
  const soma = (...xs) => ({ pior: xs.reduce((s, x) => s + x.pior, 0), melhor: xs.reduce((s, x) => s + x.melhor, 0) });
  return [
    { nome: 'Importar planilha: por produto novo (produto + custo + entrada)', porItem: soma(c.produtoCriar, c.custo, c.movEntrada), fixo: { pior: 0, melhor: 0 } },
    { nome: 'Importar planilha: por categoria ou fornecedor novo', porItem: c.categoria, fixo: { pior: 0, melhor: 0 } },
    { nome: 'Vender um kit: por item do kit (saldo + saída)', porItem: soma(c.produtoSaldo, c.movSaida), fixo: { pior: 0, melhor: 0 } },
    { nome: 'Receber pedido de compra: por item (saldo + entrada + custo)', porItem: soma(c.produtoSaldo, c.movEntrada, c.custo), fixo: c.pedidoReceber },
    { nome: 'Lançar NF-e: por item novo (produto + custo + entrada)', porItem: soma(c.produtoCriar, c.custo, c.movEntrada), fixo: c.nota },
    { nome: 'Criar grade: por variação (produto + custo)', porItem: soma(c.produtoCriar, c.custo), fixo: c.grade },
    { nome: 'Cadastrar um produto (produto + custo + entrada inicial)', porItem: soma(c.produtoCriar, c.custo, c.movEntrada), fixo: { pior: 0, melhor: 0 }, unico: true }
  ].map((f) => {
    const cabe = (modo) => Math.max(0, Math.floor((LIMITE_LOTE - f.fixo[modo]) / f.porItem[modo]));
    return { ...f, cabePior: cabe('pior'), cabeMelhor: cabe('melhor') };
  });
}

if (require.main === module) {
  const c = medir();
  console.log('\nCONSULTAS GASTAS PELAS REGRAS EM CADA GRAVAÇÃO (pior caso / documentos únicos)\n');
  Object.entries(c).forEach(([k, v]) => console.log(`  ${k.padEnd(16)} ${String(v.pior).padStart(2)} / ${v.melhor}`));
  console.log(`\nLIMITE DO FIRESTORE: ${LIMITE_LOTE} por lote ou transação, ${LIMITE_GRAVACAO} por gravação\n`);
  console.log(`${'Fluxo'.padEnd(66)} cabem (pior) cabem (melhor)`);
  fluxos(c).forEach((f) => console.log(`${f.nome.padEnd(66)} ${String(f.cabePior).padStart(6)}       ${String(f.cabeMelhor).padStart(6)}`));
  console.log('');
}
module.exports = { medir, fluxos, LIMITE_LOTE };
