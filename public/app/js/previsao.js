/*
 * Estokio — previsão de consumo e sugestão de compra.
 *
 * Consumo médio = saídas dos últimos 30 dias ÷ dias observados.
 * "Dias observados" começa na primeira movimentação do produto dentro da janela
 * (mínimo de 7 dias, para um produto novo não parecer consumir demais).
 */
(function () {
  'use strict';

  const DIA = 864e5;
  const JANELA = 30;
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

  /** Map produtoId → { mediaDia, saidas } a partir das movimentações. */
  function consumos(movs, agora = Date.now()) {
    const ini = agora - JANELA * DIA;
    const mapa = new Map();
    for (const m of movs) {
      if (!m.criadoEm || m.criadoEm < ini) continue;
      let c = mapa.get(m.produtoId);
      if (!c) { c = { saidas: 0, primeira: m.criadoEm }; mapa.set(m.produtoId, c); }
      if (m.criadoEm < c.primeira) c.primeira = m.criadoEm;
      if (m.tipo === 'saida') c.saidas += num(m.quantidade);
    }
    for (const c of mapa.values()) {
      const dias = Math.min(JANELA, Math.max(7, (agora - c.primeira) / DIA));
      c.mediaDia = c.saidas / dias;
    }
    return mapa;
  }

  /** Dias até acabar no ritmo atual (null quando não há consumo registrado). */
  function diasAteAcabar(produto, mediaDia) {
    if (!mediaDia || mediaDia <= 0) return null;
    return Math.max(0, num(produto.quantidade) / mediaDia);
  }

  /**
   * Quantidade sugerida para comprar: o suficiente para `cobertura` dias de consumo
   * e, no mínimo, para voltar a 2x o estoque mínimo, descontando o que ainda se vende até a remessa chegar.
   */
  function sugestao(produto, mediaDia, cobertura, prazo = 0) {
    const alvo = Math.max(num(produto.estoqueMinimo) * 2, (mediaDia || 0) * cobertura);
    // Com prazo de entrega, parte do estoque se vende até a remessa chegar
    const naChegada = Math.max(0, num(produto.quantidade) - (mediaDia || 0) * num(prazo));
    const falta = alvo - naChegada;
    if (falta <= 0) return 0;
    return ['kg', 'g', 'L', 'mL', 'm'].includes(produto.unidade) ? Math.ceil(falta * 10) / 10 : Math.ceil(falta);
  }

  const nfp = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  /** Quantidade em texto: unidades inteiras sem casas decimais; kg, g, L, mL e m com uma casa. */
  const FRACIONARIAS = ['kg', 'g', 'L', 'mL', 'm'];
  const fmtQ = (v, unidade) => nfp.format(FRACIONARIAS.includes(unidade) ? v : Math.round(v));
  const txtDias = (d) => (d < 1 ? 'menos de 1 dia' : `cerca de ${plural(Math.round(d), 'dia', 'dias')}`);

  /* ================= prazo de entrega dos fornecedores ================= */
  const ULTIMAS_ENTREGAS = 10;
  const temNumero = (v) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));

  /**
   * Prazo de entrega de um fornecedor, em dias.
   * - Com entregas registradas (pedidos recebidos, com os dias que o fornecedor levou): média das últimas 10, arredondada para cima.
   * - Com menos de 3 entregas, nunca fica abaixo do prazo informado: uma entrega rápida isolada não pode encurtar o planejamento.
   * - Sem entregas: o prazo informado no cadastro. Sem nenhum dos dois: null.
   */
  function prazoFornecedor(fornecedor, pedidos) {
    const informado = fornecedor && temNumero(fornecedor.prazoEntrega) ? Math.max(0, Math.round(num(fornecedor.prazoEntrega))) : null;
    const entregas = (pedidos || [])
      .filter((p) => fornecedor && p.fornecedorId === fornecedor.id && p.status === 'recebido' && temNumero(p.diasEntrega))
      .sort((a, b) => num(b.recebidoEm) - num(a.recebidoEm))
      .slice(0, ULTIMAS_ENTREGAS);
    if (!entregas.length) return { dias: informado, origem: informado === null ? null : 'informado', media: null, entregas: 0, min: null, max: null, informado, ultimas: [] };
    const dias = entregas.map((p) => Math.max(0, num(p.diasEntrega)));
    const media = dias.reduce((s, d) => s + d, 0) / dias.length;
    const arred = Math.ceil(media - 1e-9);
    return {
      dias: entregas.length < 3 && informado !== null ? Math.max(informado, arred) : arred,
      origem: 'real', media, entregas: entregas.length, min: Math.min(...dias), max: Math.max(...dias), informado,
      ultimas: entregas.map((p) => ({ numero: p.numero, dias: num(p.diasEntrega), em: num(p.recebidoEm) }))
    };
  }

  /* ================= o que vai vencer sem vender ================= */
  /**
   * Simula a saída pelo lote que vence primeiro (FEFO) no ritmo de consumo atual e devolve quanto deve sobrar,
   * sem vender, dos lotes que vencem dentro do horizonte (em dias). Lotes já vencidos contam inteiros.
   */
  function perdaPorVencimento(lotes, mediaDia, agora, horizonteDias) {
    const ordem = (lotes || []).filter((l) => l.validade && num(l.quantidade) > 0).sort((a, b) => a.validade - b.validade);
    let vendido = 0, perda = 0;
    const lista = [];
    for (const l of ordem) {
      const dias = Math.max(0, (l.validade - agora) / DIA);
      const disponivel = Math.max(0, (mediaDia || 0) * dias - vendido);
      const vend = Math.min(num(l.quantidade), disponivel);
      vendido += vend;
      const sobra = num(l.quantidade) - vend;
      if (dias <= horizonteDias && sobra > 0.0005) { perda += sobra; lista.push({ lote: l.lote, validade: l.validade, dias, quantidade: num(l.quantidade), sobra }); }
    }
    return { perda, lotes: lista, primeiro: lista[0] || null };
  }

  /* ================= hora de pedir ================= */
  /**
   * Avalia se um produto precisa de uma nova remessa agora. Motivos possíveis:
   *  - minimo: já está abaixo da linha mínima (ou acabou);
   *  - prazo: com o consumo atual, vai chegar ao mínimo (ou acabar) antes de o fornecedor entregar;
   *  - vencimento: lotes vão vencer sem vender e o estoque aproveitável fica abaixo do ponto de pedido.
   * Ponto de pedido = mínimo + consumo diário x prazo do fornecedor. Pedidos já a caminho que cobrem o ponto
   * tiram o produto do alerta (coberto). Sem prazo conhecido, vale o aviso antigo: acaba em até 7 dias.
   * `nivel` ('zerado' | 'baixo' | 'ok') vem do app, para haver uma única definição de "abaixo do mínimo".
   */
  function avaliarReposicao(produto, { mediaDia = 0, prazo = null, caminho = 0, agora = Date.now(), nivel = 'ok', horizonteBase = 7 } = {}) {
    const q = num(produto.quantidade), m = num(produto.estoqueMinimo), c = num(mediaDia);
    const L = prazo === null || prazo === undefined ? null : Math.max(0, Math.round(num(prazo)));
    const diasL = (n) => plural(n, 'dia', 'dias');
    const motivos = [];
    let urgente = false;
    const dura = c > 0 ? q / c : null;

    if (nivel !== 'ok') {
      motivos.push({ tipo: 'minimo', texto: q <= 0 ? 'Acabou' : `${q < m ? 'Abaixo do mínimo' : 'No mínimo'}: ${fmtQ(q, produto.unidade)} de ${fmtQ(m, produto.unidade)}` });
      urgente = true;
    }
    if (L !== null && c > 0) {
      if (q > 0 && dura <= L) {
        motivos.push({ tipo: 'prazo', texto: `Acaba em ${txtDias(dura)}, antes de o fornecedor entregar (${diasL(L)})`, dias: dura });
        urgente = true;
      } else if (nivel === 'ok' && q <= m + c * L) {
        motivos.push({ tipo: 'prazo', texto: `Chega ao mínimo em ${txtDias(Math.max(0, (q - m) / c))} e o fornecedor leva ${diasL(L)}`, dias: Math.max(0, (q - m) / c) });
      }
    } else if (L === null && nivel === 'ok' && q > 0 && dura !== null && dura <= horizonteBase) {
      motivos.push({ tipo: 'prazo', texto: `Acaba em ${txtDias(dura)}`, dias: dura });
    }

    // lotes que vão vencer sem vender
    let perda = 0;
    const lotes = produto.controlaValidade ? (produto.lotes || []).filter((l) => l.validade && num(l.quantidade) > 0) : [];
    if (lotes.length) {
      const r = perdaPorVencimento(lotes, c, agora, (L ?? horizonteBase) + 7);
      const util = Math.max(0, q - r.perda);
      const ponto = m + (c > 0 && L !== null ? c * L : 0);
      if (r.perda > 0.0005 && util <= ponto) {
        perda = r.perda;
        const d = r.primeiro;
        const quando = d.dias < 0.5 ? 'venceu ou vence hoje' : `vence em ${plural(Math.ceil(d.dias), 'dia', 'dias')}`;
        motivos.push({ tipo: 'vencimento', texto: `Lote ${d.lote} ${quando}: devem sobrar ${fmtQ(r.perda, produto.unidade)} ${produto.unidade || 'un'} sem vender e o estoque aproveitável fica em ${fmtQ(util, produto.unidade)}`, dias: d.dias });
        if (d.dias <= (L ?? 3)) urgente = true;
      }
    }

    const ponto = m + (c > 0 && L !== null ? c * L : 0);
    const coberto = motivos.length > 0 && num(caminho) > 0 && (q - perda + num(caminho)) > ponto;
    return { motivos, urgente: urgente && !coberto, coberto, pedir: motivos.length > 0 && !coberto, ponto, dura, perda, prazo: L };
  }

  window.EstokioPrevisao = { consumos, diasAteAcabar, sugestao, JANELA, prazoFornecedor, perdaPorVencimento, avaliarReposicao };
})();
