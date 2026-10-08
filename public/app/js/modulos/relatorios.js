/*
 * Estokio — Relatórios (plano Premium).
 * Curva ABC, giro e cobertura, produtos parados e movimentação por mês, num período escolhido.
 * "Imprimir ou salvar PDF" usa a impressão do navegador, com um layout próprio para papel.
 * Os valores usam o preço de custo e de venda atuais de cada produto.
 */
(window.EstokioModulos = window.EstokioModulos || []).push(function (A) {
  'use strict';
  const { state, esc, num, nf, cf, dfd, plural, icon } = A;
  const DIA = 864e5;
  const R = { periodo: 90, dados: null, carregando: false, chave: '', erro: '', aba: 'analise', verVenda: null };
  const chaveAtual = () => `${state.empresa && state.empresa.id}|${R.periodo}`;
  const comLimite = (promessa, ms) => Promise.race([promessa, new Promise((_, rej) => setTimeout(() => rej(new Error('O servidor demorou demais para responder.')), ms))]);
  const pct = (x) => `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  const mesFmt = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
  const rotMes = (ms) => `${mesFmt.format(ms).replace('.', '')}/${String(new Date(ms).getFullYear()).slice(2)}`;

  document.addEventListener('change', (e) => {
    if (e.target.dataset && e.target.dataset.relPeriodo !== undefined) { R.periodo = Number(e.target.value); R.dados = null; R.chave = ''; A.refresh(); }
  });

  /**
   * Busca o histórico completo do período. Em caso de erro, guarda a mensagem e NÃO tenta de novo
   * sozinho (antes ficava num ciclo de novas tentativas, preso em "Carregando").
   */
  async function carregar() {
    const chave = chaveAtual();
    if (R.carregando || R.chave === chave) return;
    R.carregando = true; R.erro = ''; R.dados = null;
    try { R.dados = await comLimite(A.DB.movimentacoesDesde(Date.now() - R.periodo * DIA), 25000); }
    catch (e) { R.erro = A.msgErro(e) + (e && e.code ? ` (${e.code})` : ''); console.error('Relatórios: falha ao buscar o histórico', e); }
    finally { R.chave = chave; R.carregando = false; A.refresh(); }
  }
  /** Movimentações usadas no relatório: o histórico completo, ou as que o app já tem carregadas. */
  function movsDoPeriodo() {
    if (R.dados && R.chave === chaveAtual()) return { movs: R.dados, completo: true };
    const desde = Date.now() - R.periodo * DIA;
    return { movs: state.movs.filter((m) => m.criadoEm >= desde), completo: false };
  }

  /** Indicadores do período a partir das movimentações. */
  function calcular(movs) {
    const porProd = new Map();
    const reg = (id) => { if (!porProd.has(id)) porProd.set(id, { saidas: 0, entradas: 0, ultimaSaida: 0 }); return porProd.get(id); };
    let valEnt = 0, valSai = 0, vendaSai = 0;
    const meses = new Map();
    for (const m of movs) {
      if (!Number.isFinite(m.criadoEm)) continue;
      const p = A.prodById(m.produtoId);
      const custo = p ? num(p.custo) : 0, preco = p ? num(p.preco) : 0;
      const r = reg(m.produtoId);
      const d = new Date(m.criadoEm); const chave = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      if (!meses.has(chave)) meses.set(chave, { ent: 0, sai: 0 });
      if (m.tipo === 'entrada') { r.entradas += num(m.quantidade); valEnt += num(m.quantidade) * custo; meses.get(chave).ent += num(m.quantidade) * custo; }
      if (m.tipo === 'saida') {
        r.saidas += num(m.quantidade); valSai += num(m.quantidade) * custo; vendaSai += num(m.quantidade) * preco;
        meses.get(chave).sai += num(m.quantidade) * custo;
        r.ultimaSaida = Math.max(r.ultimaSaida, m.criadoEm);
      }
    }
    // Curva ABC pelo valor das saídas a preço de custo
    const abc = state.produtos.map((p) => ({ p, valor: (porProd.get(p.id) || { saidas: 0 }).saidas * num(p.custo), saidas: (porProd.get(p.id) || { saidas: 0 }).saidas }))
      .filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor);
    const totalAbc = abc.reduce((s, x) => s + x.valor, 0);
    let acum = 0;
    abc.forEach((x) => { acum += x.valor; x.part = x.valor / totalAbc; x.acum = acum / totalAbc; x.classe = x.acum - x.part < 0.8 ? 'A' : x.acum - x.part < 0.95 ? 'B' : 'C'; });
    // Giro e cobertura
    const giro = state.produtos.map((p) => {
      const r = porProd.get(p.id) || { saidas: 0 };
      const porDia = r.saidas / R.periodo;
      return { p, saidas: r.saidas, giro: num(p.quantidade) > 0 ? r.saidas / num(p.quantidade) : null, cobertura: porDia > 0 && num(p.quantidade) > 0 ? num(p.quantidade) / porDia : null };
    }).filter((x) => x.saidas > 0).sort((a, b) => b.saidas * num(b.p.custo) - a.saidas * num(a.p.custo));
    // Parados: têm estoque e não saíram no período
    const parados = state.produtos.filter((p) => num(p.quantidade) > 0 && !(porProd.get(p.id) || {}).saidas)
      .map((p) => ({ p, valor: num(p.quantidade) * num(p.custo) })).sort((a, b) => b.valor - a.valor);
    return { valEnt, valSai, vendaSai, abc, totalAbc, giro, parados, meses, produtosMov: porProd.size };
  }

  function barras(meses) {
    const lista = Array.from(meses.entries()).sort((a, b) => a[0] - b[0]).slice(-12);
    if (!lista.length) return '<p class="panel-empty">Nenhuma movimentação no período.</p>';
    const max = Math.max(1, ...lista.map(([, v]) => Math.max(v.ent, v.sai)));
    return `<div class="rel-barras" role="img" aria-label="Entradas e saídas por mês, a preço de custo">
      ${lista.map(([ms, v]) => `<div class="rel-mes">
        <div class="rel-par"><span class="rb rb-ent" style="height:${Math.max(1, (v.ent / max) * 100)}%" title="Entradas: ${cf.format(v.ent)}"></span><span class="rb rb-sai" style="height:${Math.max(1, (v.sai / max) * 100)}%" title="Saídas: ${cf.format(v.sai)}"></span></div>
        <span class="rel-rot">${rotMes(ms)}</span>
      </div>`).join('')}
    </div>
    <div class="rel-legenda"><span><i class="rb-ent"></i>Entradas</span><span><i class="rb-sai"></i>Saídas</span><span class="muted">a preço de custo</span></div>`;
  }

  const views = {
    relatorios: {
      actions: () => {
        if (R.aba === 'pedidos') {
          return R.verVenda
            ? `<button class="btn" data-action="rel-voltar-pedidos">Voltar à lista</button>
               <button class="btn btn-primary" data-action="rel-imprimir">${icon('imprimir')}Imprimir ou salvar PDF</button>`
            : `<button class="btn btn-primary" data-action="nova-venda">${icon('venda')}Nova venda</button>`;
        }
        return `
        <button class="btn" data-action="rel-csv">${icon('exportar')}Exportar curva ABC</button>
        <button class="btn btn-primary" data-action="rel-imprimir">${icon('imprimir')}Imprimir ou salvar PDF</button>`;
      },
      shell: () => `
        <div class="rel-abas" role="tablist">
          <button type="button" role="tab" class="${R.aba === 'analise' ? 'is-ativa' : ''}" data-action="rel-aba" data-aba="analise" aria-selected="${R.aba === 'analise'}">Análise</button>
          <button type="button" role="tab" class="${R.aba === 'pedidos' ? 'is-ativa' : ''}" data-action="rel-aba" data-aba="pedidos" aria-selected="${R.aba === 'pedidos'}">Histórico de pedidos</button>
        </div>
        ${R.aba === 'analise' ? `<div class="toolbar rel-toolbar">
          <label class="date-f"><span>Período</span><select data-rel-periodo>
            ${[[30, 'Últimos 30 dias'], [90, 'Últimos 90 dias'], [180, 'Últimos 6 meses'], [365, 'Últimos 12 meses']].map(([v, t]) => `<option value="${v}" ${R.periodo === v ? 'selected' : ''}>${t}</option>`).join('')}
          </select></label>
        </div>` : ''}
        <div id="view-body"></div>`,
      body() {
        if (R.aba === 'pedidos') return corpoPedidos();
        if (!state.loaded.produtos || !state.loaded.movimentacoes) return A.loading();
        if (R.chave !== chaveAtual()) carregar();
        const fonte = movsDoPeriodo();
        const aviso = R.erro
          ? `<div class="rel-aviso is-erro"><span>Não foi possível buscar o histórico completo: ${esc(R.erro)} O relatório abaixo usa as últimas ${plural(state.movs.length, 'movimentação carregada', 'movimentações carregadas')}.</span><button class="btn btn-sm" data-action="rel-tentar">Tentar de novo</button></div>`
          : !fonte.completo ? `<div class="rel-aviso"><span>Buscando o histórico completo do período. Por enquanto, o relatório usa as últimas ${plural(state.movs.length, 'movimentação carregada', 'movimentações carregadas')}.</span></div>` : '';
        try {
          return aviso + corpo(calcular(fonte.movs));
        } catch (e) {
          console.error('Relatórios: erro ao montar a tela', e);
          return `${aviso}<p class="no-results">Não foi possível montar o relatório: ${esc(e.message)}. Envie esta mensagem ao suporte do Estokio.</p>`;
        }
      }
    }
  };

  /* ---------- Histórico de pedidos: recibo interno (não é documento fiscal) com itens e número do pedido ---------- */
  function corpoPedidos() {
    if (!state.loaded.pedidosVenda || !state.loaded.produtos) return A.loading();
    if (R.verVenda) {
      const v = state.pedidosVenda.find((x) => x.id === R.verVenda);
      if (!v) { R.verVenda = null; } else return corpoRecibo(v);
    }
    if (!state.pedidosVenda.length) {
      return A.emptyState('Nenhuma venda registrada ainda',
        'Use "Nova venda" para dar saída em vários produtos de uma vez. Cada venda vira um pedido numerado com recibo para imprimir ou salvar em PDF.',
        `<button class="btn btn-primary" data-action="nova-venda">${icon('venda')}Nova venda</button>`);
    }
    const lista = state.pedidosVenda.slice().sort((a, b) => num(b.numero) - num(a.numero));
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th class="num">Nº</th><th>Código</th><th>Data</th><th>Cliente</th><th>Itens</th><th class="num">Total</th><th class="col-actions"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${lista.map((v) => `<tr>
        <td class="num"><strong>${num(v.numero)}</strong></td>
        <td class="nowrap"><span class="chip chip-codigo">${esc(v.codigo || '—')}</span></td>
        <td class="nowrap">${v.criadoEm ? A.df.format(A.msDe(v.criadoEm)) : ''}</td>
        <td>${v.cliente ? esc(v.cliente) : '<span class="muted">Não informado</span>'}</td>
        <td>${plural((v.itens || []).length, 'produto', 'produtos')}</td>
        <td class="num">${cf.format(num(v.total))}</td>
        <td class="col-actions"><div class="row-actions">
          <button class="icon-btn" data-action="ver-recibo" data-id="${v.id}" title="Ver e imprimir recibo" aria-label="Ver recibo do pedido ${num(v.numero)}">${icon('imprimir')}</button>
        </div></td>
      </tr>`).join('')}</tbody></table></div>
      <p class="table-foot">${plural(lista.length, 'venda registrada', 'vendas registradas')}.</p>`;
  }

  /** Recibo interno (não é documento fiscal): layout visual com a marca Estokio, pensado para imprimir ou salvar em PDF. */
  function corpoRecibo(v) {
    const dataVenda = A.msDe(v.criadoEm);
    const itens = v.itens || [];
    return `
      <div class="recibo">
        <header class="recibo-topo">
          <div class="recibo-empresa">
            <strong class="recibo-empresa-nome">${esc(state.empresa.nome)}</strong>
            <span class="recibo-empresa-meta">${[state.empresa.cnpj ? `CNPJ ${esc(state.empresa.cnpj)}` : '', state.empresa.telefone ? esc(A.fmtFone(state.empresa.telefone)) : '', state.empresa.cidade ? esc(state.empresa.cidade) : ''].filter(Boolean).join(' · ')}</span>
          </div>
          <div class="recibo-selo">
            <span class="recibo-selo-tag">${icon('venda')}Recibo de venda</span>
            <span class="recibo-codigo">${esc(v.codigo || `Nº ${num(v.numero)}`)}</span>
            <span class="recibo-data">${dfd.format(dataVenda)}</span>
          </div>
        </header>

        <div class="recibo-info">
          <div class="recibo-info-item"><span class="recibo-info-label">Cliente</span><strong>${v.cliente ? esc(v.cliente) : 'Não informado'}</strong></div>
          <div class="recibo-info-item"><span class="recibo-info-label">Pedido</span><strong>Nº ${num(v.numero)}</strong></div>
          <div class="recibo-info-item"><span class="recibo-info-label">Itens</span><strong>${plural(itens.length, 'produto', 'produtos')}</strong></div>
          <div class="recibo-info-item"><span class="recibo-info-label">Vendido por</span><strong>${esc(A.nomeDe(v.criadoPor))}</strong></div>
        </div>

        <div class="table-wrap flat"><table class="table recibo-itens">
          <thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Preço unit.</th><th class="num">Subtotal</th></tr></thead>
          <tbody>${itens.map((i) => `<tr>
            <td><span class="p-name">${esc(i.nome)}</span></td>
            <td class="num">${nf.format(num(i.qtd))} <span class="muted">${esc(i.unidade || 'un')}</span></td>
            <td class="num">${cf.format(num(i.precoUnit))}</td>
            <td class="num">${cf.format(num(i.qtd) * num(i.precoUnit))}</td>
          </tr>`).join('')}</tbody>
        </table></div>

        <div class="recibo-total-box"><span>Total</span><strong>${cf.format(num(v.total))}</strong></div>
        ${v.observacao ? `<p class="muted recibo-obs">Observação: ${esc(v.observacao)}</p>` : ''}

        <footer class="recibo-rodape">
          <img src="assets/estokio-logo.svg" alt="Estokio" class="recibo-logo">
          <span>Comprovante interno gerado pelo Estokio em ${dfd.format(Date.now())}. Não é um documento fiscal (NF-e/NFC-e).</span>
        </footer>
      </div>`;
  }

  function corpo(c) {
    {
        const margem = c.vendaSai - c.valSai;
        const classes = ['A', 'B', 'C'].map((k) => { const l = c.abc.filter((x) => x.classe === k); return { k, n: l.length, v: l.reduce((s, x) => s + x.valor, 0) }; });
        const valorParado = c.parados.reduce((s, x) => s + x.valor, 0);
        return `
          <div class="rel-cabecalho-print"><strong>${esc(state.empresa.nome)}</strong><span>Relatório de estoque dos últimos ${R.periodo} dias, até ${dfd.format(Date.now())}</span></div>
          <section class="stats" aria-label="Resumo do período">
            <div class="stat"><span class="stat-label">Entradas</span><strong class="stat-value">${cf.format(c.valEnt)}</strong><span class="stat-sub">a preço de custo</span></div>
            <div class="stat"><span class="stat-label">Saídas</span><strong class="stat-value">${cf.format(c.valSai)}</strong><span class="stat-sub">${cf.format(c.vendaSai)} a preço de venda</span></div>
            <div class="stat"><span class="stat-label">Margem estimada</span><strong class="stat-value">${cf.format(margem)}</strong><span class="stat-sub">${c.vendaSai ? `${pct(margem / c.vendaSai)} sobre a venda` : 'Sem saídas no período'}</span></div>
            <div class="stat ${valorParado ? 'is-alert' : ''}"><span class="stat-label">Parado no estoque</span><strong class="stat-value">${cf.format(valorParado)}</strong><span class="stat-sub">${plural(c.parados.length, 'produto sem saída', 'produtos sem saída')} no período</span></div>
          </section>

          <section class="panel det-bloco rel-bloco">
            <header class="panel-head"><h2>Entradas e saídas por mês</h2></header>
            ${barras(c.meses)}
          </section>

          <section class="panel det-bloco rel-bloco">
            <header class="panel-head"><h2>Curva ABC</h2><span class="p-meta">Pelo valor das saídas a preço de custo</span></header>
            ${!c.abc.length ? '<p class="panel-empty">Nenhuma saída no período.</p>' : `
            <div class="abc-resumo">${classes.map((x) => `<div class="abc-${x.k.toLowerCase()}"><strong>Classe ${x.k}</strong><span>${plural(x.n, 'produto', 'produtos')}, ${c.totalAbc ? pct(x.v / c.totalAbc) : '0%'} do valor</span></div>`).join('')}</div>
            <p class="imp-text muted rel-dica">A classe A concentra cerca de 80% do valor que sai do estoque. São os produtos que mais pedem atenção: nunca podem faltar e merecem contagem mais frequente.</p>
            <div class="table-wrap flat"><table class="table">
              <thead><tr><th class="num">#</th><th>Produto</th><th class="num">Saídas</th><th class="num">Valor</th><th class="num">Participação</th><th class="num">Acumulado</th><th>Classe</th></tr></thead>
              <tbody>${c.abc.slice(0, 50).map((x, i) => `<tr>
                <td class="num muted">${i + 1}</td>
                <td><span class="p-name">${esc(x.p.nome)}</span></td>
                <td class="num">${nf.format(x.saidas)} <span class="muted">${esc(x.p.unidade)}</span></td>
                <td class="num">${cf.format(x.valor)}</td>
                <td class="num">${pct(x.part)}</td>
                <td class="num">${pct(x.acum)}</td>
                <td><span class="abc-chip abc-${x.classe.toLowerCase()}">${x.classe}</span></td>
              </tr>`).join('')}</tbody>
            </table></div>
            ${c.abc.length > 50 ? `<p class="table-foot pad">Mostrando os 50 primeiros de ${c.abc.length}. O CSV traz todos.</p>` : ''}`}
          </section>

          <section class="panel det-bloco rel-bloco">
            <header class="panel-head"><h2>Giro e cobertura</h2><span class="p-meta">Giro: quantas vezes o estoque atual saiu no período</span></header>
            ${!c.giro.length ? '<p class="panel-empty">Nenhuma saída no período.</p>' : `
            <div class="table-wrap flat"><table class="table">
              <thead><tr><th>Produto</th><th class="num">Saídas</th><th class="num">Estoque atual</th><th class="num">Giro</th><th class="num">Cobertura</th></tr></thead>
              <tbody>${c.giro.slice(0, 30).map((x) => `<tr>
                <td><span class="p-name">${esc(x.p.nome)}</span></td>
                <td class="num">${nf.format(x.saidas)}</td>
                <td class="num">${nf.format(num(x.p.quantidade))} <span class="muted">${esc(x.p.unidade)}</span></td>
                <td class="num">${x.giro === null ? '<span class="muted">Sem estoque</span>' : `${x.giro.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x`}</td>
                <td class="num">${x.cobertura === null ? '' : x.cobertura < 1 ? '<span class="forecast-hot">menos de 1 dia</span>' : `<span class="${x.cobertura <= 7 ? 'forecast-hot' : x.cobertura > 180 ? 'rel-excesso' : ''}">${plural(Math.round(x.cobertura), 'dia', 'dias')}</span>`}</td>
              </tr>`).join('')}</tbody>
            </table></div>
            <p class="table-foot pad">Cobertura é por quantos dias o estoque atual dura no ritmo do período. Acima de 180 dias costuma ser excesso de compra.</p>`}
          </section>

          <section class="panel det-bloco rel-bloco">
            <header class="panel-head"><h2>Produtos parados</h2><span class="p-meta">Com estoque e nenhuma saída no período</span></header>
            ${!c.parados.length ? '<p class="panel-empty">Todos os produtos com estoque tiveram saída no período.</p>' : `
            <div class="table-wrap flat"><table class="table">
              <thead><tr><th>Produto</th><th class="num">Estoque</th><th class="num">Valor parado</th><th>Última saída</th></tr></thead>
              <tbody>${c.parados.slice(0, 30).map((x) => {
                const ult = state.movs.find((m) => m.produtoId === x.p.id && m.tipo === 'saida');
                return `<tr>
                  <td><span class="p-name">${esc(x.p.nome)}</span></td>
                  <td class="num">${nf.format(num(x.p.quantidade))} <span class="muted">${esc(x.p.unidade)}</span></td>
                  <td class="num">${cf.format(x.valor)}</td>
                  <td>${ult ? dfd.format(ult.criadoEm) : '<span class="muted">Nenhuma registrada</span>'}</td>
                </tr>`;
              }).join('')}</tbody>
            </table></div>`}
          </section>
          <p class="table-foot">Valores calculados com o preço de custo e de venda atuais de cada produto.</p>`;
    }
  }

  const acoes = {
    'rel-tentar'() { R.chave = ''; R.erro = ''; A.refresh(); },
    'rel-aba'(t) { R.aba = t.dataset.aba; R.verVenda = null; A.render(); },
    'ver-recibo'(t) { R.verVenda = t.dataset.id; A.render(); },
    'rel-voltar-pedidos'() { R.verVenda = null; A.render(); },
    'rel-imprimir'() {
      document.body.classList.add('imprimindo-relatorio');
      const fim = () => { document.body.classList.remove('imprimindo-relatorio'); window.removeEventListener('afterprint', fim); };
      window.addEventListener('afterprint', fim);
      window.print();
      setTimeout(fim, 1500);
    },
    'rel-csv'() {
      const c = calcular(movsDoPeriodo().movs);
      if (!c.abc.length) return A.toast('Nenhuma saída no período.', 'erro');
      A.baixarCSV(`${A.slug()}-curva-abc-${R.periodo}dias-${A.hojeStr()}.csv`, [
        ['Posição', 'Produto', 'Código', 'Saídas', 'Unidade', 'Valor (R$)', 'Participação (%)', 'Acumulado (%)', 'Classe'],
        ...c.abc.map((x, i) => [i + 1, x.p.nome, x.p.sku, x.saidas, x.p.unidade, Math.round(x.valor * 100) / 100, Math.round(x.part * 1000) / 10, Math.round(x.acum * 1000) / 10, x.classe])
      ]);
    }
  };

  return {
    rotas: { relatorios: { titulo: 'Relatórios', recurso: 'relatorios', perm: 'gerir', vitrine: 'Curva ABC para saber quais produtos concentram o valor, giro de estoque, produtos parados e um relatório mensal para imprimir ou salvar em PDF.' } },
    views, acoes,
    icones: {
      relatorio: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
      imprimir: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z"/>'
    },
    _teste: { calcular, R }
  };
});
