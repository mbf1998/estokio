/*
 * Estokio — pedidos de compra com recebimento (plano básico).
 * Lista de compras -> pedido -> enviado ao fornecedor -> recebido (tudo ou em partes).
 * Receber lança as entradas numa operação só (com lote/validade e local quando o plano traz esses recursos)
 * e pode atualizar o preço de custo. A lista de compras desconta o que está a caminho.
 */
(window.EstokioModulos = window.EstokioModulos || []).push(function (A) {
  'use strict';
  const { state, esc, num, nf, cf, dfd, plural, icon } = A;
  const DIA = 864e5;
  const f = { filtro: 'abertos' };
  const STATUS = { aberto: 'Aguardando entrega', parcial: 'Recebido em parte', recebido: 'Recebido', cancelado: 'Cancelado' };
  const hoje0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const abertos = () => state.pedidosCompra.filter((p) => p.status === 'aberto' || p.status === 'parcial');
  const atrasado = (p) => (p.status === 'aberto' || p.status === 'parcial') && p.previsto && p.previsto < hoje0();
  const totalPedido = (p) => (p.itens || []).reduce((s, i) => s + num(i.qtd) * num(i.custo), 0);
  const proximoNumero = () => state.pedidosCompra.reduce((m, p) => Math.max(m, num(p.numero)), 0) + 1;
  const isoData = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const lerData = (v) => (v ? new Date(v + 'T12:00:00').getTime() : null);

  document.addEventListener('change', (e) => {
    if (e.target.dataset && e.target.dataset.pcFiltro !== undefined) { f.filtro = e.target.value; A.refresh(); }
  });

  function textoPedido(p) {
    const emp = state.empresa || {};
    return `Olá! Pedido nº ${p.numero} de ${emp.nome}:\n\n` +
      (p.itens || []).map((i) => `- ${nf.format(num(i.qtd))} ${i.unidade || 'un'} de ${i.nome}`).join('\n') +
      (p.previsto ? `\n\nEntrega até ${dfd.format(p.previsto)}.` : '') + (p.observacao ? `\n${p.observacao}` : '') + '\n\nObrigado!';
  }

  const views = {
    'pedidos-compra': {
      actions: () => `<button class="btn btn-primary" data-action="novo-pedido-compra">${icon('plus')}Novo pedido</button>`,
      shell: () => `
        <div class="toolbar">
          <select data-pc-filtro aria-label="Filtrar pedidos">
            ${[['abertos', 'Aguardando entrega'], ['recebido', 'Recebidos'], ['todos', 'Todos']].map(([v, t]) => `<option value="${v}" ${f.filtro === v ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div id="view-body"></div>`,
      body() {
        if (!state.loaded.pedidosCompra || !state.loaded.produtos) return A.loading();
        if (!state.pedidosCompra.length) {
          return A.emptyState('Nenhum pedido de compra ainda',
            'Na lista de compras, use "Criar pedido" em um fornecedor. O pedido fica aqui até a mercadoria chegar, e o recebimento lança as entradas de uma vez.',
            `<a class="btn btn-primary" href="#/compras">${icon('compras')}Abrir lista de compras</a>`);
        }
        const lista = state.pedidosCompra.filter((p) => f.filtro === 'todos' || (f.filtro === 'abertos' ? (p.status === 'aberto' || p.status === 'parcial') : p.status === f.filtro))
          .sort((a, b) => num(b.numero) - num(a.numero));
        const custoOk = A.pode('verCusto');
        if (!lista.length) return '<p class="no-results">Nenhum pedido neste filtro.</p>';
        return `<div class="table-wrap"><table class="table">
          <thead><tr><th class="num">Nº</th><th>Fornecedor</th><th>Itens</th>${custoOk ? '<th class="num">Total</th>' : ''}<th>Entrega</th><th>Situação</th><th class="col-actions"><span class="sr-only">Ações</span></th></tr></thead>
          <tbody>${lista.map((p) => {
            const rec = (p.itens || []).reduce((s, i) => s + Math.min(num(i.recebido), num(i.qtd)), 0), tot = (p.itens || []).reduce((s, i) => s + num(i.qtd), 0);
            return `<tr>
              <td class="num"><strong>${num(p.numero)}</strong></td>
              <td><span class="p-name">${esc(p.fornecedorNome || 'Sem fornecedor')}</span><span class="p-sku">${p.criadoEm ? `Criado em ${dfd.format(p.criadoEm)}` : ''}</span></td>
              <td>${plural((p.itens || []).length, 'produto', 'produtos')}${p.status === 'parcial' ? `<span class="p-sku">${nf.format(rec)} de ${nf.format(tot)} recebidos</span>` : ''}</td>
              ${custoOk ? `<td class="num">${cf.format(totalPedido(p))}</td>` : ''}
              <td class="nowrap">${p.previsto ? dfd.format(p.previsto) : '<span class="muted">Sem data</span>'}${p.status === 'recebido' && p.diasEntrega !== undefined && p.diasEntrega !== null ? `<span class="p-sku">Levou ${plural(num(p.diasEntrega), 'dia', 'dias')}</span>` : ''}${atrasado(p) ? '<span class="badge badge-zerado pc-atraso">Atrasado</span>' : ''}</td>
              <td><span class="chip pc-${p.status}">${STATUS[p.status] || p.status}</span></td>
              <td class="col-actions"><div class="row-actions">
                ${p.status === 'aberto' || p.status === 'parcial' ? `<button class="btn btn-sm btn-primary" data-action="receber-pedido" data-id="${p.id}">Receber</button>` : ''}
                <button class="icon-btn" data-action="ver-pedido-compra" data-id="${p.id}" title="Ver e enviar" aria-label="Ver o pedido ${num(p.numero)}">${icon('editar')}</button>
              </div></td>
            </tr>`; }).join('')}</tbody></table></div>
          <p class="table-foot">${plural(abertos().length, 'pedido aguardando entrega', 'pedidos aguardando entrega')}${abertos().filter(atrasado).length ? `, ${abertos().filter(atrasado).length} atrasado(s)` : ''}.</p>`;
      }
    }
  };

  /* ---------- criar e editar pedido ---------- */
  function pedidoForm(base) {
    const ed = Boolean(base && base.id);
    const diasPadrao = (fid) => { const pz = A.prazoDe(fid); return pz.dias === null ? 3 : pz.dias; };
    const p = base || { itens: [{}], previsto: Date.now() + 3 * DIA };
    const custoOk = A.pode('verCusto');
    const ps = A.sortedProds().filter((x) => !A.ehKit(x));
    const opcoes = (sel) => ps.map((x) => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.nome)}${x.sku ? ` (${esc(x.sku)})` : ''}</option>`).join('');
    const linha = (i) => `<div class="pc-linha">
      <select name="pcItem" aria-label="Produto"><option value="">Escolha um produto</option>${opcoes(i.produtoId)}</select>
      <input name="pcQtd" type="number" min="0" step="any" inputmode="decimal" value="${esc(i.qtd ?? '')}" placeholder="Qtd" aria-label="Quantidade">
      ${custoOk ? `<input name="pcCusto" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(i.custo ?? '')}" placeholder="Custo" aria-label="Custo unitário">` : ''}
      <button type="button" class="icon-btn i-del" data-pc-tirar aria-label="Tirar item">${icon('excluir')}</button></div>`;
    const m = A.openModal(`
      <form id="f-pc" novalidate>
        ${A.modalHead(ed ? `Pedido nº ${num(p.numero)}` : 'Novo pedido de compra')}
        <div class="modal-body">
          <div class="grid-2">
            <label class="field"><span>Fornecedor</span><select name="fornecedorId"><option value="">Sem fornecedor</option>${A.sortedForn().map((x) => `<option value="${x.id}" ${x.id === p.fornecedorId ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>
            <label class="field"><span>Entrega prevista</span><input name="previsto" type="date" value="${p.previsto ? isoData(p.previsto) : ''}"></label>
          </div>
          <p class="muted pc-prazo" id="pc-prazo-dica"></p>
          <div class="pc-cab"><span>Produto</span><span>Quantidade</span>${custoOk ? '<span>Custo unitário</span>' : ''}<span></span></div>
          <div class="pc-lista">${(p.itens && p.itens.length ? p.itens : [{}]).map(linha).join('')}</div>
          <button type="button" class="btn btn-sm" data-pc-mais>${icon('plus')}Adicionar produto</button>
          <template id="pc-modelo">${linha({})}</template>
          <label class="field"><span>Observação para o fornecedor</span><input name="observacao" maxlength="200" value="${esc(p.observacao)}" placeholder="Ex.: entregar pela manhã"></label>
          ${custoOk ? '<p class="pc-total">Total: <strong id="pc-total">R$ 0,00</strong></p>' : ''}
          <p class="form-error" role="alert" hidden></p>
        </div>
        <footer class="modal-foot">
          ${ed && A.pode('gerir') && p.status !== 'recebido' && p.status !== 'cancelado' ? '<button type="button" class="btn btn-danger" data-pc-cancelar>Cancelar pedido</button>' : ''}
          <button type="button" class="btn" data-action="close-modal">Fechar</button>
          ${ed && (p.status === 'recebido' || p.status === 'cancelado') ? '' : `<button class="btn btn-primary" type="submit">${ed ? 'Salvar pedido' : 'Criar pedido'}</button>`}
        </footer>
      </form>`, { wide: true });
    const form = A.$('#f-pc', m);
    const lista = A.$('.pc-lista', m);
    const ler = () => A.$$('.pc-linha', form).map((l) => {
      const id = l.querySelector('[name=pcItem]').value;
      const prod = A.prodById(id);
      return { produtoId: id, nome: prod ? prod.nome : '', unidade: prod ? prod.unidade : 'un', qtd: num(l.querySelector('[name=pcQtd]').value),
        custo: custoOk ? num((l.querySelector('[name=pcCusto]') || {}).value) : 0 };
    }).filter((i) => i.produtoId && i.qtd > 0);
    // A data prevista acompanha o prazo de entrega do fornecedor, até a pessoa mexer nela
    let tocouData = ed;
    const dicaPrazo = () => {
      const pz = A.prazoDe(form.fornecedorId.value);
      A.$('#pc-prazo-dica', m).textContent = !form.fornecedorId.value ? '' : pz.dias === null
        ? 'Este fornecedor ainda não tem prazo de entrega. Informe em Fornecedores para a data prevista e os avisos ficarem certos.'
        : `Este fornecedor leva ${plural(pz.dias, 'dia', 'dias')}${pz.origem === 'real' ? ` (média de ${plural(pz.entregas, 'entrega', 'entregas')})` : ' (informado)'}.`;
    };
    form.previsto.addEventListener('input', () => { tocouData = true; });
    form.fornecedorId.addEventListener('change', () => {
      if (!tocouData && form.fornecedorId.value) form.previsto.value = isoData(Date.now() + diasPadrao(form.fornecedorId.value) * DIA);
      dicaPrazo();
    });
    dicaPrazo();
    const somar = () => { const t = A.$('#pc-total', m); if (t) t.textContent = cf.format(ler().reduce((s, i) => s + i.qtd * i.custo, 0)); };
    form.addEventListener('input', somar); somar();
    form.addEventListener('change', (e) => {
      // Ao escolher o produto, preenche o custo cadastrado
      if (e.target.name === 'pcItem' && custoOk) { const c = e.target.closest('.pc-linha').querySelector('[name=pcCusto]'); const prod = A.prodById(e.target.value); if (c && prod && !c.value) c.value = num(prod.custo) || ''; somar(); }
    });
    form.addEventListener('click', async (e) => {
      if (e.target.closest('[data-pc-mais]')) lista.insertAdjacentHTML('beforeend', A.$('#pc-modelo', m).innerHTML);
      const t = e.target.closest('[data-pc-tirar]'); if (t) { t.closest('.pc-linha').remove(); somar(); }
      if (e.target.closest('[data-pc-cancelar]')) {
        if (!(await A.confirmar('Cancelar pedido', `O pedido nº ${num(p.numero)} deixa de aparecer como "a caminho". O que já foi recebido continua no estoque.`, 'Cancelar pedido'))) return;
        try { await A.DB.salvarPedidoCompra({ id: p.id, status: 'cancelado' }, state.user); A.closeModal(); A.toast('Pedido cancelado.'); } catch (err) { A.toast(A.msgErro(err), 'erro'); }
      }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const itensForm = ler();
      // Junta linhas repetidas do mesmo produto
      const mapa = new Map();
      itensForm.forEach((i) => { const x = mapa.get(i.produtoId); if (x) x.qtd += i.qtd; else mapa.set(i.produtoId, { ...i }); });
      const itens = Array.from(mapa.values()).map((i) => {
        const antigo = (p.itens || []).find((x) => x.produtoId === i.produtoId);
        return { ...i, recebido: antigo ? num(antigo.recebido) : 0 };
      });
      if (!itens.length) return A.showFormError(form, 'Adicione pelo menos um produto com quantidade.');
      const forn = A.fornById(form.fornecedorId.value);
      const dados = { fornecedorId: forn ? forn.id : '', fornecedorNome: forn ? forn.nome : '', previsto: lerData(form.previsto.value), observacao: form.observacao.value.trim(), itens };
      if (ed) dados.id = p.id; else Object.assign(dados, { numero: proximoNumero(), status: 'aberto' });
      const btn = form.querySelector('[type=submit]'); A.setBusy(btn, true);
      try {
        await A.DB.salvarPedidoCompra(dados, state.user);
        A.closeModal();
        if (!ed) { A.toast(`Pedido nº ${dados.numero} criado.`); enviar({ ...dados, numero: dados.numero }); }
        else A.toast('Pedido salvo.');
      } catch (err) { A.showFormError(form, A.msgErro(err)); A.setBusy(btn, false); }
    });
  }

  /** Depois de criar: enviar ao fornecedor pelo WhatsApp ou copiar. */
  function enviar(p) {
    const forn = A.fornById(p.fornecedorId);
    const txt = textoPedido(p);
    A.openModal(`${A.modalHead(`Pedido nº ${num(p.numero)}`)}
      <div class="modal-body">
        <p class="confirm-text">O pedido aparece como <strong>a caminho</strong> na lista de compras até ser recebido. Envie ao fornecedor:</p>
        <textarea class="msg-box" rows="8" readonly>${esc(txt)}</textarea>
      </div>
      <footer class="modal-foot">
        <button type="button" class="btn" data-pc-copiar>${icon('copiar')}Copiar</button>
        ${forn && forn.telefone ? `<a class="btn btn-primary" target="_blank" rel="noopener" href="https://wa.me/${A.waNumero(forn.telefone)}?text=${encodeURIComponent(txt)}">${icon('whatsapp')}Enviar pelo WhatsApp</a>` : ''}
      </footer>`);
    const b = document.querySelector('[data-pc-copiar]');
    if (b) b.onclick = () => A.copiar(txt);
  }

  /* ---------- receber ---------- */
  function receber(p) {
    const usaLotes = A.recurso('lotes');
    const usaLocais = A.recurso('multiloja') && state.locais.length >= 2;
    const custoOk = A.pode('verCusto');
    const linhas = (p.itens || []).map((it, idx) => ({ it, idx, prod: A.prodById(it.produtoId), falta: Math.max(0, num(it.qtd) - num(it.recebido)) })).filter((x) => x.falta > 0);
    const m = A.openModal(`
      <form id="f-rec-pc" novalidate>
        ${A.modalHead(`Receber pedido nº ${num(p.numero)}`)}
        <div class="modal-body">
          <p class="confirm-text">${esc(p.fornecedorNome || 'Sem fornecedor')}. Confira a mercadoria e informe o que chegou. Se faltou algo, o restante continua a caminho.</p>
          ${usaLocais ? `<label class="field"><span>Receber em</span><select name="localId">${state.locais.map((l) => `<option value="${l.id}" ${l.padrao ? 'selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></label>` : ''}
          <div class="table-wrap flat"><table class="table pc-rec">
            <thead><tr><th>Produto</th><th class="num">Pedido</th><th class="num">Chegou agora</th>${usaLotes ? '<th>Lote e validade</th>' : ''}</tr></thead>
            <tbody>${linhas.map((l) => `<tr>
              <td><span class="p-name">${esc(l.it.nome)}</span>${num(l.it.recebido) ? `<span class="p-sku">${nf.format(num(l.it.recebido))} já recebidos</span>` : ''}</td>
              <td class="num">${nf.format(l.falta)} <span class="muted">${esc(l.it.unidade || 'un')}</span></td>
              <td class="num"><input class="qtd-input" type="number" min="0" step="any" inputmode="decimal" name="rec-${l.idx}" value="${l.falta}" aria-label="Quantidade recebida de ${esc(l.it.nome)}"></td>
              ${usaLotes ? `<td>${l.prod && l.prod.controlaValidade ? `<div class="pc-lote"><input name="lote-${l.idx}" maxlength="40" placeholder="Lote" aria-label="Lote"><input name="val-${l.idx}" type="date" aria-label="Validade"></div>` : '<span class="muted">Não controla</span>'}</td>` : ''}
            </tr>`).join('')}</tbody></table></div>
          <label class="field campo-dias"><span>Dias que o fornecedor levou</span>
            <input name="diasEntrega" type="number" min="0" max="365" step="1" inputmode="numeric" value="${Math.max(0, Math.round((Date.now() - num(p.criadoEm)) / DIA))}">
            <small class="muted">Contados desde que o pedido foi criado. Corrija se o pedido foi feito em outro dia: o Estokio usa esse número para avisar a hora certa de pedir.</small></label>
          ${custoOk ? '<label class="check"><input type="checkbox" name="atualizarCusto" checked> Atualizar o preço de custo dos produtos com o valor do pedido</label>' : ''}
          <p class="form-error" role="alert" hidden></p>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit">Registrar recebimento</button></footer>
      </form>`, { wide: true });
    const form = A.$('#f-rec-pc', m);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const itens = [];
      for (const l of linhas) {
        const q = num(form[`rec-${l.idx}`].value);
        if (q <= 0) continue;
        const item = { idx: l.idx, qtd: q };
        if (usaLotes && l.prod && l.prod.controlaValidade) {
          const lote = form[`lote-${l.idx}`].value.trim();
          if (!lote) return A.showFormError(form, `Informe o lote de ${l.it.nome}.`);
          item.lote = { lote, validade: lerData(form[`val-${l.idx}`].value) };
        }
        itens.push(item);
      }
      if (!itens.length) return A.showFormError(form, 'Informe a quantidade que chegou de pelo menos um produto.');
      const dias = form.diasEntrega.value.trim();
      if (dias !== '' && (num(dias) < 0 || num(dias) > 365)) return A.showFormError(form, 'Os dias de entrega devem ficar entre 0 e 365.');
      const r = { pedidoId: p.id, itens, atualizarCusto: Boolean(form.atualizarCusto && form.atualizarCusto.checked), diasEntrega: dias === '' ? undefined : Math.round(num(dias)) };
      if (usaLocais) {
        r.localId = form.localId.value;
        r.localNome = (state.locais.find((x) => x.id === r.localId) || {}).nome || '';
        r.localPadrao = (state.locais.find((x) => x.padrao) || state.locais[0]).id;
      }
      const btn = form.querySelector('[type=submit]'); A.setBusy(btn, true, 'Lançando entradas…');
      try { await A.DB.receberPedido(r, state.user); A.closeModal(); A.toast('Recebimento registrado. As entradas foram lançadas no estoque.'); }
      catch (err) { A.showFormError(form, A.msgErro(err)); A.setBusy(btn, false); }
    });
  }

  const acoes = {
    'novo-pedido-compra': () => pedidoForm(null),
    'ver-pedido-compra': (t) => { const p = state.pedidosCompra.find((x) => x.id === t.dataset.id); if (p) pedidoForm(p); },
    'receber-pedido': (t) => { const p = state.pedidosCompra.find((x) => x.id === t.dataset.id); if (p) receber(p); },
    /** Vem da lista de compras: um pedido com os itens marcados daquele fornecedor. */
    'criar-pedido-compra': (t) => {
      const g = A.gruposCompra().find((x) => x.id === t.dataset.grupo);
      if (!g) return;
      const itens = g.itens.filter((i) => i.inc && num(i.qtd) > 0).map((i) => ({ produtoId: i.p.id, qtd: num(i.qtd), custo: num(i.p.custo) }));
      if (!itens.length) return A.toast('Marque pelo menos um produto com quantidade para comprar.', 'erro');
      const pz = A.prazoDe(g.forn ? g.forn.id : null);
      pedidoForm({ fornecedorId: g.forn ? g.forn.id : '', previsto: Date.now() + (pz.dias === null ? 3 : pz.dias) * DIA, itens });
    },
    /** Do painel "Hora de pedir": um pedido deste produto, com a quantidade sugerida e a entrega pelo prazo do fornecedor. */
    'pedir-produto': (t) => {
      const p = A.prodById(t.dataset.id);
      if (!p) return;
      const forn = A.fornById(p.fornecedorId);
      if (!forn) return A.toast('Ligue este produto a um fornecedor no cadastro para pedir.', 'erro');
      const pz = A.prazoDe(forn.id);
      const qtd = Math.max(1, A.Prev.sugestao(p, A.mediaDia(p), state.compra.cobertura, pz.dias || 0) - A.aCaminho(p.id));
      pedidoForm({ fornecedorId: forn.id, previsto: Date.now() + (pz.dias === null ? 3 : pz.dias) * DIA, itens: [{ produtoId: p.id, qtd, custo: num(p.custo) }] });
    }
  };

  return {
    rotas: { 'pedidos-compra': { titulo: 'Pedidos de compra', perm: 'estoque' } },
    views, acoes,
    hooks: {
      /** Painel: pedidos atrasados. */
      painel() {
        if (!A.pode('estoque')) return '';
        const atr = abertos().filter(atrasado);
        if (!atr.length) return '';
        return `<section class="panel painel-extra">
          <header class="panel-head"><h2>Pedidos de compra atrasados</h2><a class="link-btn" href="#/pedidos-compra">Ver pedidos</a></header>
          <ul class="feed">${atr.slice(0, 5).map((p) => `<li class="feed-val">
            <span class="badge badge-zerado">${Math.max(1, Math.floor((hoje0() - p.previsto) / DIA))} dia(s)</span>
            <span class="feed-name">Pedido nº ${num(p.numero)}, ${esc(p.fornecedorNome || 'sem fornecedor')}</span>
            <span class="feed-qtd">${plural((p.itens || []).length, 'produto', 'produtos')}</span>
            <span class="feed-time">Previsto para ${dfd.format(p.previsto)}</span></li>`).join('')}</ul>
        </section>`;
      }
    },
    icones: { pedido: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h5"/>' },
    _teste: { textoPedido, proximoNumero }
  };
});
