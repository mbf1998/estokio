/*
 * Estokio — Multiloja (plano Premium).
 * - Tela Locais: lojas e depósitos, com itens, unidades e valor em cada um.
 * - Todo o estoque que já existia fica no local principal.
 * - Movimentações escolhem o local; transferência entre locais mantém o total.
 * - Tabela de produtos mostra quanto há em cada local.
 */
(window.EstokioModulos = window.EstokioModulos || []).push(function (A) {
  'use strict';
  const { state, esc, num, nf, cf, plural, icon, recurso } = A;
  const f = { local: '' };

  const locais = () => state.locais.slice().sort((a, b) => (b.padrao ? 1 : 0) - (a.padrao ? 1 : 0) || (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  const padrao = () => state.locais.find((l) => l.padrao) || locais()[0] || null;
  const ativo = () => recurso('multiloja') && state.locais.length >= 2;
  /** Quantidade do produto num local. Produtos antigos (sem mapa) têm tudo no principal. */
  function qtdLocal(p, id) {
    if (p.estoques && Object.keys(p.estoques).length) return num(p.estoques[id]);
    const pad = padrao();
    return pad && pad.id === id ? num(p.quantidade) : 0;
  }
  const nomeLocal = (id) => (state.locais.find((l) => l.id === id) || {}).nome || '';

  document.addEventListener('change', (e) => {
    if (e.target.dataset && e.target.dataset.locaisF !== undefined) { f.local = e.target.value; A.refresh(); }
  });

  const views = {
    locais: {
      actions: () => (state.locais.length >= 2
        ? `<button class="btn" data-action="transferir">${icon('transferir')}Transferir entre locais</button><button class="btn btn-primary" data-action="novo-local">${icon('plus')}Novo local</button>`
        : state.locais.length ? `<button class="btn btn-primary" data-action="novo-local">${icon('plus')}Novo local</button>` : ''),
      shell: () => `<div id="view-body"></div>`,
      body() {
        if (!state.loaded.locais || !state.loaded.produtos) return A.loading();
        const ls = locais();
        if (!ls.length) {
          return A.emptyState('Cadastre seus locais de estoque',
            'Comece pelo local principal, onde fica todo o estoque que você já cadastrou. Depois adicione as outras lojas ou depósitos e transfira mercadoria entre eles.',
            `<button class="btn btn-primary" data-action="novo-local" data-principal="1">${icon('plus')}Criar local principal</button>`);
        }
        const alvo = f.local && ls.find((l) => l.id === f.local) ? f.local : ls[0].id;
        const prods = A.sortedProds().filter((p) => qtdLocal(p, alvo) > 0);
        return `
          <div class="locais-grid">${ls.map((l) => {
            const itens = state.produtos.filter((p) => qtdLocal(p, l.id) > 0);
            const un = itens.reduce((s, p) => s + qtdLocal(p, l.id), 0);
            const valor = itens.reduce((s, p) => s + qtdLocal(p, l.id) * num(p.custo), 0);
            return `<article class="local-card ${l.id === alvo ? 'is-sel' : ''}">
              <header><span class="local-ico">${icon(l.tipo === 'deposito' ? 'deposito' : 'loja')}</span><div><h2>${esc(l.nome)}</h2><span class="p-sku">${l.tipo === 'deposito' ? 'Depósito' : 'Loja'}${l.padrao ? ', principal' : ''}</span></div></header>
              <dl><div><dt>Itens</dt><dd>${itens.length}</dd></div><div><dt>Unidades</dt><dd>${nf.format(un)}</dd></div>${A.pode('verCusto') ? `<div><dt>Valor a custo</dt><dd>${cf.format(valor)}</dd></div>` : ''}</dl>
              <footer>
                <button class="btn btn-sm" data-action="ver-local" data-id="${l.id}">${l.id === alvo ? 'Mostrando' : 'Ver estoque'}</button>
                <button class="icon-btn" data-action="editar-local" data-id="${l.id}" title="Editar" aria-label="Editar ${esc(l.nome)}">${icon('editar')}</button>
                ${l.padrao ? '' : `<button class="icon-btn i-del" data-action="excluir-local" data-id="${l.id}" title="Excluir" aria-label="Excluir ${esc(l.nome)}">${icon('excluir')}</button>`}
              </footer>
            </article>`;
          }).join('')}</div>
          <section class="panel det-bloco">
            <header class="panel-head"><h2>Estoque em ${esc(nomeLocal(alvo))}</h2></header>
            ${!prods.length ? '<p class="panel-empty">Nenhum produto neste local.</p>' : `
            <div class="table-wrap flat"><table class="table">
              <thead><tr><th>Produto</th><th class="num">Neste local</th><th class="num">Total</th><th>Em outros locais</th><th class="col-actions"><span class="sr-only">Ações</span></th></tr></thead>
              <tbody>${prods.map((p) => `<tr>
                <td><span class="p-name">${esc(p.nome)}</span>${p.sku ? `<span class="p-sku">${esc(p.sku)}</span>` : ''}</td>
                <td class="num"><strong>${nf.format(qtdLocal(p, alvo))}</strong> <span class="muted">${esc(p.unidade)}</span></td>
                <td class="num">${nf.format(num(p.quantidade))}</td>
                <td class="p-sku">${ls.filter((l) => l.id !== alvo && qtdLocal(p, l.id) > 0).map((l) => `${esc(l.nome)}: ${nf.format(qtdLocal(p, l.id))}`).join(', ') || 'Nenhum'}</td>
                <td class="col-actions"><div class="row-actions">${ls.length >= 2 ? `<button class="icon-btn" data-action="transferir" data-id="${p.id}" data-de="${alvo}" title="Transferir" aria-label="Transferir ${esc(p.nome)}">${icon('transferir')}</button>` : ''}</div></td>
              </tr>`).join('')}</tbody>
            </table></div>`}
          </section>
          ${ls.length < 2 ? '<p class="table-foot">Cadastre um segundo local para começar a separar o estoque e transferir entre eles.</p>' : ''}`;
      }
    }
  };

  function localForm(l, principal) {
    const ed = Boolean(l);
    l = l || { tipo: principal ? 'loja' : 'deposito', nome: principal ? 'Loja principal' : '' };
    const m = A.openModal(`
      <form id="f-local" novalidate>
        ${A.modalHead(ed ? 'Editar local' : principal ? 'Local principal' : 'Novo local')}
        <div class="modal-body">
          ${principal ? '<p class="confirm-text">Todo o estoque que você já tem cadastrado passa a ficar neste local.</p>' : ''}
          <label class="field"><span>Nome</span><input name="nome" maxlength="50" value="${esc(l.nome)}" autofocus></label>
          <label class="field"><span>Tipo</span><select name="tipo"><option value="loja" ${l.tipo !== 'deposito' ? 'selected' : ''}>Loja</option><option value="deposito" ${l.tipo === 'deposito' ? 'selected' : ''}>Depósito</option></select></label>
          <label class="field"><span>Endereço</span><input name="endereco" maxlength="120" value="${esc(l.endereco)}" placeholder="Opcional"></label>
          <p class="form-error" role="alert" hidden></p>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit">${ed ? 'Salvar' : 'Criar local'}</button></footer>
      </form>`);
    const form = A.$('#f-local', m);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const dados = { nome: form.nome.value.trim(), tipo: form.tipo.value, endereco: form.endereco.value.trim() };
      if (!dados.nome) return A.showFormError(form, 'Informe o nome do local.');
      if (state.locais.some((x) => x.id !== (l.id || '') && A.norm(x.nome) === A.norm(dados.nome))) return A.showFormError(form, 'Já existe um local com esse nome.');
      if (ed) dados.id = l.id; else dados.padrao = !state.locais.length;
      const btn = form.querySelector('[type=submit]'); A.setBusy(btn, true);
      try { await A.DB.saveLocal(dados); A.closeModal(); A.toast(ed ? 'Local atualizado.' : 'Local criado.'); }
      catch (err) { A.showFormError(form, A.msgErro(err)); A.setBusy(btn, false); }
    });
  }

  async function excluirLocal(id) {
    const l = state.locais.find((x) => x.id === id);
    if (!l) return;
    const com = state.produtos.filter((p) => qtdLocal(p, id) > 0).length;
    if (com) return A.toast(`${l.nome} ainda tem ${plural(com, 'produto', 'produtos')} em estoque. Transfira tudo antes de excluir.`, 'erro');
    if (!(await A.confirmar('Excluir local', `Excluir <strong>${esc(l.nome)}</strong>? O histórico de movimentações continua guardado.`, 'Excluir local'))) return;
    try { await A.DB.deleteLocal(id); A.toast('Local excluído.'); } catch (err) { A.toast(A.msgErro(err), 'erro'); }
  }

  function transferirForm(produtoId, de) {
    const ls = locais();
    if (ls.length < 2) return A.toast('Cadastre pelo menos dois locais para transferir.', 'erro');
    const ps = A.sortedProds();
    const origem = de || ls[0].id;
    const m = A.openModal(`
      <form id="f-transf" novalidate>
        ${A.modalHead('Transferir entre locais')}
        <div class="modal-body">
          <label class="field"><span>Produto</span><select name="produtoId">
            <option value="">Escolha um produto</option>
            ${ps.map((p) => `<option value="${p.id}" ${p.id === produtoId ? 'selected' : ''}>${esc(p.nome)}${p.sku ? ` (${esc(p.sku)})` : ''}</option>`).join('')}
          </select></label>
          <div class="grid-2">
            <label class="field"><span>De</span><select name="de">${ls.map((l) => `<option value="${l.id}" ${l.id === origem ? 'selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></label>
            <label class="field"><span>Para</span><select name="para">${ls.map((l) => `<option value="${l.id}" ${l.id !== origem && l.id === (ls.find((x) => x.id !== origem) || {}).id ? 'selected' : ''}>${esc(l.nome)}</option>`).join('')}</select></label>
          </div>
          <label class="field"><span>Quantidade</span><input name="quantidade" type="number" min="0" step="any" inputmode="decimal" ${produtoId ? 'autofocus' : ''}></label>
          <div class="preview" id="transf-prev"></div>
          <label class="field"><span>Observação</span><input name="observacao" maxlength="200" placeholder="Ex.: reposição da loja"></label>
          <p class="form-error" role="alert" hidden></p>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit">Transferir</button></footer>
      </form>`);
    const form = A.$('#f-transf', m);
    const prev = A.$('#transf-prev', m);
    const atualizar = () => {
      const p = A.prodById(form.produtoId.value);
      if (!p) { prev.innerHTML = ''; return; }
      const q = num(form.quantidade.value);
      const d0 = qtdLocal(p, form.de.value), p0 = qtdLocal(p, form.para.value);
      const erro = q > d0;
      prev.className = 'preview' + (erro ? ' is-error' : '');
      prev.innerHTML = `<span class="prev-label">${esc(nomeLocal(form.de.value))}: ${nf.format(d0)} para ${nf.format(Math.max(0, d0 - q))}. ${esc(nomeLocal(form.para.value))}: ${nf.format(p0)} para ${nf.format(p0 + q)}.</span>${erro ? '<span class="prev-err">Quantidade maior que o estoque da origem.</span>' : ''}`;
    };
    form.addEventListener('input', atualizar); form.addEventListener('change', atualizar); atualizar();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = { produtoId: form.produtoId.value, de: form.de.value, para: form.para.value, quantidade: num(form.quantidade.value), observacao: form.observacao.value.trim() };
      if (!t.produtoId) return A.showFormError(form, 'Escolha o produto.');
      if (t.de === t.para) return A.showFormError(form, 'A origem e o destino precisam ser diferentes.');
      if (t.quantidade <= 0) return A.showFormError(form, 'Informe a quantidade.');
      t.deNome = nomeLocal(t.de); t.paraNome = nomeLocal(t.para);
      t.localPadrao = (padrao() || {}).id;
      const btn = form.querySelector('[type=submit]'); A.setBusy(btn, true, 'Transferindo…');
      try { await A.DB.transferir(t, state.user); A.closeModal(); A.toast('Transferência registrada.'); }
      catch (err) { A.showFormError(form, A.msgErro(err)); A.setBusy(btn, false); }
    });
  }

  const acoes = {
    'novo-local': (t) => localForm(null, Boolean(t.dataset.principal) || !state.locais.length),
    'editar-local': (t) => localForm(state.locais.find((l) => l.id === t.dataset.id)),
    'excluir-local': (t) => excluirLocal(t.dataset.id),
    'ver-local': (t) => { f.local = t.dataset.id; A.refresh(); },
    transferir: (t) => transferirForm(t.dataset.id, t.dataset.de)
  };

  const selectLocal = (nome, p, pre, rotulo) => `<label class="field"><span>${rotulo}</span><select name="${nome}">
    ${locais().map((l) => `<option value="${l.id}" ${l.id === pre ? 'selected' : ''}>${esc(l.nome)}${p ? ` (${nf.format(qtdLocal(p, l.id))} ${esc(p.unidade)})` : ''}</option>`).join('')}
  </select></label>`;

  const hooks = {
    estoqueExtra(p) {
      if (!ativo() || num(p.quantidade) <= 0) return '';
      const partes = locais().filter((l) => qtdLocal(p, l.id) > 0).map((l) => `${esc(l.nome)} ${nf.format(qtdLocal(p, l.id))}`);
      return partes.length ? `<span class="min-note locais-note">${partes.join(', ')}</span>` : '';
    },
    acoesLinha(p) {
      if (!ativo()) return '';
      return `<button class="icon-btn" data-action="transferir" data-id="${p.id}" title="Transferir entre locais" aria-label="Transferir ${esc(p.nome)}">${icon('transferir')}</button>`;
    },
    movCamposAntes(p, tipo, box) {
      if (!ativo()) return '';
      const pre = box.dataset.local || (padrao() || {}).id;
      return selectLocal('localId', p, pre, tipo === 'ajuste' ? 'Local contado' : 'Local');
    },
    movDados(form, p, dados) {
      if (!ativo() || !form.localId) return;
      dados.localId = form.localId.value;
      dados.localNome = nomeLocal(dados.localId);
      dados.localPadrao = (padrao() || {}).id;
      if (p && dados.tipo === 'saida' && num(dados.quantidade) > qtdLocal(p, dados.localId)) {
        throw new Error(`${dados.localNome} tem só ${nf.format(qtdLocal(p, dados.localId))} ${p.unidade} deste produto.`);
      }
    },
    prodCampos(p, ed) {
      if (!ativo() || ed) return '';
      return `<div class="span-2">${selectLocal('localInicial', null, (padrao() || {}).id, 'Local do estoque inicial')}</div>`;
    },
    prodDados(form, p, ed, dados) {
      if (!ativo() || ed || !form.localInicial || num(dados.quantidadeInicial) <= 0) return;
      const id = form.localInicial.value;
      dados.estoques = { [id]: num(dados.quantidadeInicial) };
      dados._movExtra = { ...(dados._movExtra || {}), localId: id, localNome: nomeLocal(id) };
    }
  };

  return {
    rotas: { locais: { titulo: 'Locais de estoque', recurso: 'multiloja', perm: 'estoque', vitrine: 'Separe o estoque por loja e depósito, veja quanto há em cada lugar e transfira mercadoria entre eles sem perder o controle do total.' } },
    views, acoes, hooks,
    icones: {
      loja: '<path d="M4 10v10h16V10M3 10l2-6h14l2 6zM9 20v-6h6v6"/>',
      deposito: '<path d="M3 21V9l9-5 9 5v12M7 21v-8h10v8M7 17h10"/>',
      transferir: '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>'
    },
    _teste: { qtdLocal }
  };
});
