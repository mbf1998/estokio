/*
 * Estokio — regras de planos (compartilhado pelo app, pelo painel admin e pela página inicial).
 *
 * Três planos, cada um com três preços (mensal, trimestral, anual) e sem pacotes adicionais:
 *   Básico  — 2 usuários, até 500 produtos, o essencial do estoque e das compras
 *   Pro     — 5 usuários, produtos ilimitados, + NF-e, validade/lotes/inventário, grade, kits e etiquetas
 *   Premium — 10 usuários, + relatórios, multiloja, integração com lojas online e suporte prioritário
 *
 * Plano (planos/{id}): { nome, ordem, descricao, destaque, precos: { mensal, trimestral, anual }, maxUsuarios, maxProdutos,
 *                        recursos, suportePrioritario, publico, ativo }
 * O teste grátis é um plano de sistema (sistema: true, 7 dias, todos os recursos).
 * Planos antigos (um documento por período, com preco/dias) continuam valendo para quem já os tem, mas não são mais vendidos.
 * A empresa guarda o resultado já calculado: planoId, planoNome, planoPeriodo, planoDias, planoPreco, maxUsuarios,
 * maxProdutos e recursos.
 */
(function () {
  'use strict';

  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const r2 = (n) => Math.round(n * 100) / 100;

  /* ---------- recursos ---------- */
  const RECURSOS = ['leitor', 'importacao', 'compras', 'nfe', 'lotes', 'grade', 'kits', 'etiquetas', 'relatorios', 'multiloja', 'integracao'];
  const NOMES_RECURSOS = {
    leitor: 'Leitor de código de barras', importacao: 'Importação de planilha', compras: 'Lista de compras e pedidos de compra',
    nfe: 'Entrada pelo XML da nota fiscal (NF-e)', lotes: 'Validade, lotes e inventário', grade: 'Grade de tamanho e cor',
    kits: 'Kits e combos', etiquetas: 'Etiquetas com código de barras', relatorios: 'Relatórios (curva ABC, giro, parados, PDF)',
    multiloja: 'Multiloja: lojas, depósitos e transferências', integracao: 'Integração com lojas online'
  };
  /** Ficam desligados quando o plano não diz nada sobre eles. Os demais ficam ligados, a menos que o plano os desligue. */
  const EXIGE_CONTRATO = ['lotes', 'grade', 'multiloja', 'relatorios', 'etiquetas', 'integracao'];
  const TODOS = Object.fromEntries(RECURSOS.map((r) => [r, true]));
  const BASE = Object.fromEntries(RECURSOS.map((r) => [r, !EXIGE_CONTRATO.includes(r)]));

  /* ---------- períodos ---------- */
  const PERIODOS = [
    { id: 'mensal', nome: 'Mensal', dias: 30, meses: 1, curto: 'por mês' },
    { id: 'trimestral', nome: 'Trimestral', dias: 90, meses: 3, curto: 'a cada 3 meses' },
    { id: 'anual', nome: 'Anual', dias: 365, meses: 12, curto: 'por ano' }
  ];
  const periodoDe = (id) => PERIODOS.find((p) => p.id === id) || null;
  const periodoPorDias = (d) => PERIODOS.find((p) => p.dias === num(d)) || null;

  /* ---------- catálogo padrão ---------- */
  const REC_BASICO = { leitor: true, importacao: true, compras: true, nfe: false, lotes: false, grade: false, kits: false, etiquetas: false, relatorios: false, multiloja: false, integracao: false };
  const REC_PRO = { ...REC_BASICO, nfe: true, lotes: true, grade: true, kits: true, etiquetas: true };
  const REC_PREMIUM = { ...REC_PRO, relatorios: true, multiloja: true, integracao: true };

  const PADRAO_PLANOS = {
    teste: { nome: 'Teste grátis', preco: 0, dias: 7, maxUsuarios: 5, maxProdutos: 0, recursos: { ...TODOS }, publico: false, ativo: true, sistema: true, ordem: 0,
      descricao: '7 dias com todos os recursos do Premium. Criado pelo próprio cliente no site.' },
    basico: { nome: 'Básico', ordem: 1, precos: { mensal: 39.9, trimestral: 107.9, anual: 399 }, maxUsuarios: 2, maxProdutos: 500, recursos: REC_BASICO,
      suportePrioritario: false, destaque: false, publico: true, ativo: true, descricao: 'Para quem está saindo do caderno ou da planilha.' },
    pro: { nome: 'Pro', ordem: 2, precos: { mensal: 59.9, trimestral: 161.9, anual: 599 }, maxUsuarios: 5, maxProdutos: 0, recursos: REC_PRO,
      suportePrioritario: false, destaque: true, publico: true, ativo: true, descricao: 'O que mercadinhos, lojas e farmácias precisam no dia a dia.' },
    premium: { nome: 'Premium', ordem: 3, precos: { mensal: 89.9, trimestral: 242.9, anual: 899 }, maxUsuarios: 10, maxProdutos: 0, recursos: REC_PREMIUM,
      suportePrioritario: true, destaque: false, publico: true, ativo: true, descricao: 'Para quem tem mais de um ponto, mais gente ou vende online.' }
  };
  const planosPadrao = () => Object.entries(PADRAO_PLANOS).map(([id, p]) => ({ id, ...p }));

  /* ---------- leitura do catálogo ---------- */
  const ehNivel = (p) => Boolean(p && p.precos && typeof p.precos === 'object');
  const ehLegado = (p) => Boolean(p && !p.sistema && !ehNivel(p));
  const preco = (plano, periodoId) => num(plano && plano.precos && plano.precos[periodoId]);
  const porOrdem = (a, b) => num(a.ordem) - num(b.ordem) || preco(a, 'mensal') - preco(b, 'mensal');
  const planosVendaveis = (planos) => (planos || []).filter((p) => ehNivel(p) && p.ativo !== false && p.publico !== false && !p.sistema).sort(porOrdem);
  /** Catálogo em uso: o do Firestore, ou o padrão enquanto ainda não foi salvo. */
  const catalogo = (doFirestore) => (planosVendaveis(doFirestore).length ? doFirestore : planosPadrao());

  /* ---------- preços ---------- */
  function equivalenteMes(plano, periodoId) {
    const per = periodoDe(periodoId);
    return per ? r2(preco(plano, periodoId) / per.meses) : 0;
  }
  /** Desconto em % sobre pagar mês a mês (0 no mensal). */
  function economia(plano, periodoId) {
    const per = periodoDe(periodoId), mensal = preco(plano, 'mensal');
    if (!per || per.meses === 1 || !mensal) return 0;
    return Math.round((1 - preco(plano, periodoId) / (mensal * per.meses)) * 100);
  }
  /** "2 meses grátis" no anual quando a conta fecha; senão "N% de desconto". */
  function rotuloDesconto(plano, periodoId) {
    const per = periodoDe(periodoId), mensal = preco(plano, 'mensal');
    if (!per || per.meses === 1 || !mensal) return '';
    const gratis = per.meses - preco(plano, periodoId) / mensal;
    if (per.id === 'anual' && Math.abs(gratis - Math.round(gratis)) < 0.15 && Math.round(gratis) >= 1) return `${Math.round(gratis)} meses grátis`;
    const e = economia(plano, periodoId);
    return e > 0 ? `${e}% de desconto` : '';
  }

  /** Pedido de um plano em um período. */
  function orcamento(plano, periodoId) {
    const per = periodoDe(periodoId);
    if (!per || !plano) return { itens: [], total: 0, dias: 0, periodo: periodoId };
    const valor = r2(preco(plano, periodoId));
    return { itens: [{ tipo: 'plano', id: plano.id, nome: `Plano ${plano.nome}, ${per.nome.toLowerCase()}`, qtd: 1, valor }], total: valor, dias: per.dias, periodo: per.id };
  }

  /* ---------- o que o plano grava na empresa ---------- */
  function aplicar(plano, periodoId) {
    if (!plano) return { planoId: null, planoNome: '', planoPeriodo: null, planoPreco: 0, planoDias: 30, maxProdutos: 0, maxUsuarios: 5, recursos: { ...BASE }, pacotes: {} };
    const legado = ehLegado(plano);
    const per = legado ? periodoPorDias(plano.dias) : periodoDe(periodoId);
    return {
      planoId: plano.id, planoNome: plano.nome, planoPeriodo: per ? per.id : null,
      planoDias: legado ? (num(plano.dias) || 30) : (per ? per.dias : 30),
      planoPreco: legado ? num(plano.preco) : preco(plano, periodoId),
      maxUsuarios: num(plano.maxUsuarios) || 5, maxProdutos: num(plano.maxProdutos),
      recursos: { ...BASE, ...(plano.recursos || {}) }, pacotes: {}
    };
  }

  /* ---------- comparações para trocar de plano ---------- */
  /** Menor plano à venda que libera o recurso (para dizer "disponível a partir do Pro"). */
  function planoQueLibera(recursoK, planos) {
    return planosVendaveis(planos).find((p) => (p.recursos || {})[recursoK] === true) || null;
  }
  /** Problemas de trocar para este plano: mais usuários ou produtos do que ele permite. */
  function limitesExcedidos(plano, { usuarios = 0, produtos = 0 } = {}) {
    const out = [];
    const mu = num(plano.maxUsuarios), mp = num(plano.maxProdutos);
    if (mu && usuarios > mu) out.push(`A empresa tem ${usuarios} usuários e o plano ${plano.nome} permite ${mu}. Remova ${usuarios - mu} da equipe antes de trocar.`);
    if (mp && produtos > mp) out.push(`A empresa tem ${produtos} produtos e o plano ${plano.nome} permite ${mp}.`);
    return out;
  }
  /** Recursos que a empresa tem agora e o plano novo não traz. */
  function recursosPerdidos(recursosAtuais, plano) {
    const novo = { ...BASE, ...(plano.recursos || {}) };
    return RECURSOS.filter((k) => (recursosAtuais || {})[k] === true && novo[k] !== true).map((k) => NOMES_RECURSOS[k]);
  }
  /** Recursos que este plano acrescenta em relação ao anterior (para os cartões). */
  function novidadesDoPlano(plano, planos) {
    const lista = planosVendaveis(planos);
    const i = lista.findIndex((p) => p.id === plano.id);
    const antes = i > 0 ? { ...BASE, ...(lista[i - 1].recursos || {}) } : null;
    return RECURSOS.filter((k) => (plano.recursos || {})[k] === true && (!antes || antes[k] !== true));
  }

  /** Dias de antecedência do aviso de vencimento, proporcional ao período. */
  const diasAviso = (dias) => (num(dias) <= 7 ? 2 : num(dias) <= 90 ? 7 : 15);
  const descreverItens = (itens) => (itens || []).map((i) => (i.qtd > 1 ? `${i.nome} x${i.qtd}` : i.nome)).join(' + ');

  window.EstokioAssinatura = {
    RECURSOS, NOMES_RECURSOS, EXIGE_CONTRATO, TODOS, BASE, PERIODOS, PADRAO_PLANOS, REC_BASICO, REC_PRO, REC_PREMIUM,
    periodoDe, periodoPorDias, planosPadrao, ehNivel, ehLegado, planosVendaveis, catalogo,
    preco, equivalenteMes, economia, rotuloDesconto, orcamento, aplicar,
    planoQueLibera, limitesExcedidos, recursosPerdidos, novidadesDoPlano, diasAviso, descreverItens
  };
})();
