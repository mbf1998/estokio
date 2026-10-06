/*
 * Estokio — Validade, lotes e inventário (plano Pro e Premium).
 * - No produto: "Controlar validade e lote".
 * - Entrada: pede lote e validade. Saída: sai primeiro o que vence primeiro (ou o lote escolhido).
 * - Tela Validades: tudo o que venceu ou vai vencer, com baixa do lote em um clique.
 * - Painel: bloco com as próximas validades.
 */
(window.EstokioModulos = window.EstokioModulos || []).push(function (A) {
  'use strict';
  const { state, esc, num, nf, cf, dfd, plural, icon, recurso } = A;
  const DIA = 864e5;
  const f = { filtro: '30', q: '' };

  // Filtros da tela (um único ouvinte para o app todo)
  const onInput = (e) => { const k = e.target.dataset && e.target.dataset.lotes; if (k) { f[k] = e.target.value; A.refresh(); } };
  document.addEventListener('input', onInput);
  document.addEventListener('change', onInput);

  const hoje0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const diasPara = (ms) => Math.floor((ms - hoje0()) / DIA);
  /** Lotes do produto, com o saldo sem lote como "Sem lote" (produtos que já tinham estoque). */
  function lotesDe(p) {
    const ls = Array.isArray(p.lotes) ? p.lotes.filter((l) => num(l.quantidade) > 0).map((l) => ({ ...l, quantidade: num(l.quantidade) })) : [];
    const resto = Math.round((num(p.quantidade) - ls.reduce((s, l) => s + l.quantidade, 0)) * 1000) / 1000;
    if (resto > 0.0005) {
      const sem = ls.find((l) => l.id === 'semlote');
      if (sem) sem.quantidade += resto; else ls.push({ id: 'semlote', lote: 'Sem lote', validade: null, quantidade: resto });
    }
    return ls.sort((a, b) => (a.validade || Infinity) - (b.validade || Infinity));
  }
  function situacaoValidade(validade) {
    if (!validade) return { cls: 'val-sem', txt: 'Sem validade' };
    const d = diasPara(validade);
    if (d < 0) return { cls: 'val-vencido', txt: `Venceu há ${plural(-d, 'dia', 'dias')}` };
    if (d === 0) return { cls: 'val-vencido', txt: 'Vence hoje' };
    if (d <= 7) return { cls: 'val-7', txt: `Vence em ${plural(d, 'dia', 'dias')}` };
    if (d <= 30) return { cls: 'val-30', txt: `Vence em ${d} dias` };
    return { cls: 'val-ok', txt: `Vence em ${d} dias` };
  }
  /** Todos os lotes com validade de todos os produtos que controlam validade. */
  function todosLotes() {
    const out = [];
    for (const p of state.produtos) {
      if (!p.controlaValidade) continue;
      for (const l of lotesDe(p)) out.push({ p, l });
    }
    return out.sort((a, b) => (a.l.validade || Infinity) - (b.l.validade || Infinity));
  }
  const isoData = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const lerData = (v) => (v ? new Date(v + 'T12:00:00').getTime() : null);

  const views = {
    validades: {
      actions: () => `<button class="btn" data-action="lotes-csv">${icon('exportar')}Exportar CSV</button>`,
      shell: () => `
        <div class="toolbar">
          <label class="search">${icon('busca')}<input type="search" data-lotes="q" value="${esc(f.q)}" placeholder="Buscar por produto ou lote" aria-label="Buscar lotes"></label>
          <select data-lotes="filtro" aria-label="Filtrar por validade">
            ${[['vencidos', 'Vencidos'], ['7', 'Vencem em até 7 dias'], ['30', 'Vencem em até 30 dias'], ['90', 'Vencem em até 90 dias'], ['todos', 'Todos os lotes']]
              .map(([v, t]) => `<option value="${v}" ${f.filtro === v ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div id="view-body"></div>`,
      body() {
        if (!state.loaded.produtos) return A.loading();
        const controlados = state.produtos.filter((p) => p.controlaValidade);
        if (!controlados.length) {
          return A.emptyState('Nenhum produto controla validade ainda',
            'Abra um produto em Produtos, marque "Controlar validade e lote" e salve. A partir daí, cada entrada pede o lote e a validade, e as saídas usam primeiro o que vence primeiro.', '');
        }
        const todos = todosLotes();
        const venc = todos.filter((x) => x.l.validade && diasPara(x.l.validade) < 0);
        const em7 = todos.filter((x) => x.l.validade && diasPara(x.l.validade) >= 0 && diasPara(x.l.validade) <= 7);
        const em30 = todos.filter((x) => x.l.validade && diasPara(x.l.validade) > 7 && diasPara(x.l.validade) <= 30);
        const valor = (lista) => lista.reduce((s, x) => s + x.l.quantidade * num(x.p.custo), 0);
        const qq = A.norm(f.q);
        const lista = todos.filter(({ p, l }) => {
          if (qq && !A.norm(`${p.nome} ${p.sku} ${l.lote}`).includes(qq)) return false;
          if (f.filtro === 'todos') return true;
          if (!l.validade) return false;
          const d = diasPara(l.validade);
          return f.filtro === 'vencidos' ? d < 0 : d <= Number(f.filtro);
        });
        return `
          <section class="stats" aria-label="Resumo de validades">
            <div class="stat ${venc.length ? 'is-alert' : ''}"><span class="stat-label">Vencidos</span><strong class="stat-value">${venc.length}</strong><span class="stat-sub">${A.pode('verCusto') ? `${cf.format(valor(venc))} a preço de custo` : plural(venc.length, 'lote', 'lotes')}</span></div>
            <div class="stat"><span class="stat-label">Vencem em até 7 dias</span><strong class="stat-value">${em7.length}</strong><span class="stat-sub">${A.pode('verCusto') ? `${cf.format(valor(em7))} a preço de custo` : 'na prateleira'}</span></div>
            <div class="stat"><span class="stat-label">Vencem em 8 a 30 dias</span><strong class="stat-value">${em30.length}</strong><span class="stat-sub">${A.pode('verCusto') ? `${cf.format(valor(em30))} a preço de custo` : 'na prateleira'}</span></div>
            <div class="stat"><span class="stat-label">Produtos controlados</span><strong class="stat-value">${controlados.length}</strong><span class="stat-sub">${plural(todos.length, 'lote em estoque', 'lotes em estoque')}</span></div>
          </section>
          ${!lista.length ? '<p class="no-results">Nenhum lote neste filtro.</p>' : `
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Produto</th><th>Lote</th><th>Validade</th><th class="num">Quantidade</th>${A.pode('verCusto') ? '<th class="num">Valor a custo</th>' : ''}<th class="col-actions"><span class="sr-only">Ações</span></th></tr></thead>
            <tbody>${lista.map(({ p, l }) => { const s = situacaoValidade(l.validade); return `<tr>
              <td><span class="p-name">${esc(p.nome)}</span>${p.sku ? `<span class="p-sku">${esc(p.sku)}</span>` : ''}</td>
              <td>${esc(l.lote)}</td>
              <td class="nowrap">${l.validade ? dfd.format(l.validade) : ''}<span class="val-chip ${s.cls}">${s.txt}</span></td>
              <td class="num"><strong>${nf.format(l.quantidade)}</strong> <span class="muted">${esc(p.unidade)}</span></td>
              ${A.pode('verCusto') ? `<td class="num">${cf.format(l.quantidade * num(p.custo))}</td>` : ''}
              <td class="col-actions"><div class="row-actions">
                <button class="btn btn-sm" data-action="lote-baixa" data-id="${p.id}" data-lote="${esc(l.id)}" data-qtd="${l.quantidade}" data-vencido="${l.validade && diasPara(l.validade) < 0 ? '1' : ''}">Dar baixa</button>
              </div></td>
            </tr>`; }).join('')}</tbody>
          </table></div>`}
          <p class="table-foot">As saídas normais usam primeiro o lote que vence primeiro. "Dar baixa" registra a saída de um lote específico, por exemplo para descarte de vencidos.</p>`;
      }
    }
  };

  const acoes = {
    'lote-baixa'(t) {
      A.movementForm({ produtoId: t.dataset.id, tipo: 'saida', quantidade: t.dataset.qtd, loteId: t.dataset.lote, observacao: t.dataset.vencido ? 'Descarte: produto vencido' : '' });
    },
    'lotes-csv'() {
      const linhas = todosLotes().map(({ p, l }) => [p.nome, p.sku, l.lote, l.validade ? dfd.format(l.validade) : '', l.validade ? diasPara(l.validade) : '', l.quantidade, p.unidade, Math.round(l.quantidade * num(p.custo) * 100) / 100]);
      if (!linhas.length) return A.toast('Nenhum lote para exportar.', 'erro');
      A.baixarCSV(`${A.slug()}-validades-${A.hojeStr()}.csv`, [['Produto', 'Código', 'Lote', 'Validade', 'Dias até vencer', 'Quantidade', 'Unidade', 'Valor a custo (R$)'], ...linhas]);
    }
  };

  const hooks = {
    /** Painel: próximas validades. */
    painel() {
      if (!recurso('lotes')) return '';
      const prox = todosLotes().filter((x) => x.l.validade && diasPara(x.l.validade) <= 30);
      if (!prox.length) return '';
      return `
        <section class="panel painel-extra">
          <header class="panel-head"><h2>Validades próximas</h2><a class="link-btn" href="#/validades">Ver todas</a></header>
          <ul class="feed">${prox.slice(0, 6).map(({ p, l }) => { const s = situacaoValidade(l.validade); return `
            <li class="feed-val">
              <span class="val-chip ${s.cls}">${s.txt}</span>
              <span class="feed-name">${esc(p.nome)}</span>
              <span class="feed-qtd">${nf.format(l.quantidade)} ${esc(p.unidade)}</span>
              <span class="feed-time">Lote ${esc(l.lote)}, ${dfd.format(l.validade)}</span>
            </li>`; }).join('')}</ul>
        </section>`;
    },
    /** Tabela de produtos: próxima validade. */
    estoqueExtra(p) {
      if (!recurso('lotes') || !p.controlaValidade || num(p.quantidade) <= 0) return '';
      const l = lotesDe(p).find((x) => x.validade);
      if (!l) return '<span class="min-note">Sem validade informada</span>';
      const s = situacaoValidade(l.validade);
      return `<span class="min-note ${s.cls === 'val-vencido' || s.cls === 'val-7' ? 'forecast-hot' : ''}">Próxima validade ${dfd.format(l.validade)}</span>`;
    },
    /** Movimentação: lote e validade na entrada; escolha do lote na saída. */
    movCampos(p, tipo, box) {
      if (!recurso('lotes') || !p.controlaValidade) return '';
      if (tipo === 'saida') {
        const pre = box.dataset.lote;
        return `<label class="field"><span>Lote</span><select name="loteId">
          <option value="">Automático: sai primeiro o que vence primeiro</option>
          ${lotesDe(p).map((l) => `<option value="${esc(l.id)}" ${pre === l.id ? 'selected' : ''}>${esc(l.lote)}${l.validade ? `, vence ${dfd.format(l.validade)}` : ''} (${nf.format(l.quantidade)} ${esc(p.unidade)})</option>`).join('')}
        </select></label>`;
      }
      return `<div class="grid-2 lote-campos">
        <label class="field"><span>Lote</span><input name="lote" maxlength="40" autocomplete="off" placeholder="Ex.: L2403"></label>
        <label class="field"><span>Validade</span><input name="validade" type="date"></label>
        ${tipo === 'ajuste' ? '<p class="muted span-2 lote-nota">O lote só é usado se a contagem for maior que o estoque. Se for menor, a diferença sai dos lotes que vencem primeiro.</p>' : ''}
      </div>`;
    },
    movDados(form, p, dados) {
      if (!recurso('lotes') || !p || !p.controlaValidade) return;
      if (dados.tipo === 'saida') { if (form.loteId && form.loteId.value) dados.loteId = form.loteId.value; return; }
      const lote = form.lote ? form.lote.value.trim() : '';
      const aumenta = dados.tipo === 'entrada' || num(dados.quantidade) > num(p.quantidade);
      if (aumenta && !lote) throw new Error('Este produto controla validade: informe o lote.');
      if (lote) dados.lote = { lote, validade: lerData(form.validade.value) };
    },
    /** Produto: liga o controle e, no cadastro, pede o lote do estoque inicial. */
    prodCampos(p, ed) {
      if (!recurso('lotes')) return '';
      return `<div class="span-2 lote-prod">
        <label class="check"><input type="checkbox" name="controlaValidade" ${p.controlaValidade ? 'checked' : ''}> Controlar validade e lote deste produto</label>
        ${!ed ? `<div class="grid-2 lote-inicial" ${p.controlaValidade ? '' : 'hidden'}>
          <label class="field"><span>Lote do estoque inicial</span><input name="loteInicial" maxlength="40" autocomplete="off"></label>
          <label class="field"><span>Validade</span><input name="validadeInicial" type="date"></label>
        </div>` : ''}
        ${ed && p.controlaValidade ? `<p class="muted lote-nota">${plural(lotesDe(p).length, 'lote em estoque', 'lotes em estoque')}. Veja em Validades.</p>` : ''}
      </div>`;
    },
    prodMontar(form) {
      if (!form.controlaValidade) return;
      form.controlaValidade.addEventListener('change', () => { const b = form.querySelector('.lote-inicial'); if (b) b.hidden = !form.controlaValidade.checked; });
    },
    prodDados(form, p, ed, dados) {
      if (!recurso('lotes') || !form.controlaValidade) return;
      dados.controlaValidade = form.controlaValidade.checked;
      if (ed || !dados.controlaValidade || num(dados.quantidadeInicial) <= 0) return;
      const lote = form.loteInicial.value.trim();
      if (!lote) throw new Error('Informe o lote do estoque inicial, ou desmarque "Controlar validade".');
      const validade = lerData(form.validadeInicial.value);
      const q = num(dados.quantidadeInicial);
      dados.lotes = [{ id: Math.random().toString(36).slice(2, 10), lote, validade, quantidade: q }];
      dados._movExtra = { ...(dados._movExtra || {}), lotes: [{ lote, validade, quantidade: q }] };
    }
  };

  return {
    rotas: { validades: { titulo: 'Validades', recurso: 'lotes', vitrine: 'Registre o lote e a validade em cada entrada. As saídas usam primeiro o que vence primeiro, e esta tela mostra o que venceu ou vai vencer, com o valor em risco.' } },
    views, acoes, hooks,
    icones: { validade: '<rect x="3.5" y="5" width="17" height="15" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4"/>' },
    _teste: { lotesDe, diasPara, isoData }
  };
});
