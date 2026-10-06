/*
 * Estokio — inventário (plano Pro e Premium, junto com validade e lotes).
 * 1. O responsável ou gerente abre uma contagem: tudo, uma categoria ou um local (com Multiloja).
 * 2. A equipe conta pelo celular ou pelo computador, lendo o código ou buscando pelo nome.
 *    Cada contagem é salva na hora, então várias pessoas podem contar ao mesmo tempo.
 *    Na contagem às cegas, quem conta não vê o que o sistema espera.
 * 3. Ao concluir, o relatório mostra sobras, faltas e o valor da diferença, e os ajustes
 *    são lançados de uma vez. Concluir de novo só ajusta o que ainda estiver diferente.
 */
(window.EstokioModulos = window.EstokioModulos || []).push(function (A) {
  'use strict';
  const { state, esc, num, nf, cf, dfd, df, plural, icon } = A;
  const E = { atual: null, soPendentes: false, busca: '' };

  const inv = () => state.inventarios.find((x) => x.id === E.atual) || null;
  const padrao = () => state.locais.find((l) => l.padrao) || state.locais[0] || null;
  /** Saldo do produto no escopo do inventário (no local, se for por local). */
  function saldo(p, i) {
    if (i.escopo && i.escopo.tipo === 'local') {
      if (p.estoques && Object.keys(p.estoques).length) return num(p.estoques[i.escopo.valor]);
      const pad = padrao();
      return pad && pad.id === i.escopo.valor ? num(p.quantidade) : 0;
    }
    return num(p.quantidade);
  }
  function produtosDo(i) {
    return A.sortedProds().filter((p) => !A.ehKit(p) && (!i.escopo || i.escopo.tipo === 'todos'
      || (i.escopo.tipo === 'categoria' && p.categoriaId === i.escopo.valor)
      || i.escopo.tipo === 'local'));
  }
  const nomeEscopo = (i) => (!i.escopo || i.escopo.tipo === 'todos' ? 'Todos os produtos'
    : i.escopo.tipo === 'categoria' ? `Categoria ${A.catName(i.escopo.valor) || '(removida)'}`
    : `Local ${(state.locais.find((l) => l.id === i.escopo.valor) || {}).nome || '(removido)'}`);
  function diferencas(i, naoContadosZerados) {
    const out = [];
    for (const p of produtosDo(i)) {
      const c = (i.contagens || {})[p.id];
      if (!c && !naoContadosZerados) continue;
      const contado = c ? num(c.qtd) : 0, sist = saldo(p, i), dif = Math.round((contado - sist) * 1000) / 1000;
      out.push({ produtoId: p.id, nome: p.nome, unidade: p.unidade, sistema: sist, contado, dif, valor: Math.round(dif * num(p.custo) * 100) / 100, contadoPor: c ? c.por : '', naoContado: !c });
    }
    return out;
  }

  document.addEventListener('input', (e) => {
    const d = e.target.dataset || {};
    if (d.invBusca !== undefined) { E.busca = e.target.value; const b = document.getElementById('inv-corpo'); if (b) b.innerHTML = corpoContagem(); }
  });
  document.addEventListener('change', async (e) => {
    const d = e.target.dataset || {};
    if (d.invPend !== undefined) { E.soPendentes = e.target.checked; A.refresh(); }
    if (d.invConta) {
      const i = inv(); if (!i) return;
      const v = e.target.value.trim();
      e.target.closest('tr').classList.add('salvando');
      try { await A.DB.contarItem(i.id, d.invConta, v === '' ? null : num(v), state.user); }
      catch (err) { A.toast(A.msgErro(err), 'erro'); }
    }
  });
  document.addEventListener('keydown', (e) => {
    // Enter no leitor/busca: vai direto para o campo de contagem do produto encontrado
    if (e.key !== 'Enter' || !e.target.dataset || e.target.dataset.invBusca === undefined) return;
    e.preventDefault();
    const i = inv(); if (!i) return;
    const termo = e.target.value.trim();
    const p = A.prodPorCodigo(termo) || produtosDo(i).find((x) => A.norm(x.nome).includes(A.norm(termo)));
    if (!p || !produtosDo(i).some((x) => x.id === p.id)) return A.toast('Produto não encontrado nesta contagem.', 'erro');
    E.busca = ''; e.target.value = '';
    const b = document.getElementById('inv-corpo'); if (b) b.innerHTML = corpoContagem();
    const campo = document.querySelector(`[data-inv-conta="${p.id}"]`);
    if (campo) { campo.focus(); campo.select(); campo.closest('tr').classList.add('destaque'); }
  });

  function corpoContagem() {
    const i = inv(); if (!i) return '';
    const mostrarSistema = !i.cego;
    const qq = A.norm(E.busca);
    const lista = produtosDo(i).filter((p) => (!E.soPendentes || !(i.contagens || {})[p.id]) && (!qq || A.norm(`${p.nome} ${p.sku} ${p.codigoBarras}`).includes(qq)));
    if (!lista.length) return `<p class="no-results">${E.soPendentes ? 'Todos os produtos já foram contados.' : 'Nenhum produto encontrado.'}</p>`;
    return `<div class="table-wrap"><table class="table inv-tabela">
      <thead><tr><th>Produto</th><th>Local na loja</th>${mostrarSistema ? '<th class="num">No sistema</th>' : ''}<th class="num">Contado</th>${mostrarSistema ? '<th class="num">Diferença</th>' : ''}<th>Quem contou</th></tr></thead>
      <tbody>${lista.map((p) => {
        const c = (i.contagens || {})[p.id], dif = c ? num(c.qtd) - saldo(p, i) : null;
        return `<tr class="${c ? 'is-contado' : ''}">
          <td><span class="p-name">${esc(p.nome)}</span>${p.sku ? `<span class="p-sku">${esc(p.sku)}</span>` : ''}</td>
          <td>${esc(p.localizacao) || '<span class="muted">Não informado</span>'}</td>
          ${mostrarSistema ? `<td class="num">${nf.format(saldo(p, i))}</td>` : ''}
          <td class="num"><input class="qtd-input" type="number" min="0" step="any" inputmode="decimal" data-inv-conta="${p.id}" value="${c ? num(c.qtd) : ''}" placeholder="Contar" aria-label="Quantidade contada de ${esc(p.nome)}"> <span class="muted">${esc(p.unidade)}</span></td>
          ${mostrarSistema ? `<td class="num">${dif === null ? '' : dif === 0 ? '<span class="inv-ok">Confere</span>' : `<b class="${dif < 0 ? 'neg' : 'pos'}">${dif > 0 ? '+' : ''}${nf.format(dif)}</b>`}</td>` : ''}
          <td class="p-sku">${c ? `${esc(A.nomeDe(c.por))}${c.em ? `, ${df.format(c.em)}` : ''}` : ''}</td>
        </tr>`; }).join('')}</tbody></table></div>`;
  }

  const views = {
    inventario: {
      actions: () => (E.atual && inv() && inv().status === 'aberto'
        ? `<button class="btn" data-action="inv-voltar">Voltar</button>${A.pode('gerir') ? `<button class="btn btn-primary" data-action="inv-concluir">${icon('ok')}Concluir inventário</button>` : ''}`
        : A.pode('gerir') ? `<button class="btn btn-primary" data-action="inv-novo">${icon('plus')}Novo inventário</button>` : ''),
      shell() {
        const i = E.atual && inv();
        if (i && i.status === 'aberto') {
          return `
          <div class="toolbar">
            <label class="search">${icon('busca')}<input type="search" data-inv-busca value="${esc(E.busca)}" placeholder="Leia o código ou digite o nome e tecle Enter" aria-label="Buscar produto para contar" autofocus></label>
            <label class="check"><input type="checkbox" data-inv-pend ${E.soPendentes ? 'checked' : ''}> Só os que faltam contar</label>
          </div>
          <div id="view-body"></div>`;
        }
        return '<div id="view-body"></div>';
      },
      body() {
        if (!state.loaded.produtos || !state.loaded.inventarios) return A.loading();
        const i = E.atual && inv();
        if (i && i.status === 'aberto') {
          // Cada contagem salva redesenha a lista: devolve o foco (e o que já foi digitado) ao campo em que a pessoa estava
          const ativo = document.activeElement;
          if (ativo && ativo.dataset && ativo.dataset.invConta) {
            const id = ativo.dataset.invConta, valor = ativo.value, sel = [ativo.selectionStart, ativo.selectionEnd];
            setTimeout(() => {
              const c = document.querySelector(`[data-inv-conta="${id}"]`);
              if (!c) return;
              c.value = valor; c.focus();
              try { c.setSelectionRange(sel[0], sel[1]); } catch (e) { /* campo numérico */ }
            }, 0);
          }
          const total = produtosDo(i).length, contados = produtosDo(i).filter((p) => (i.contagens || {})[p.id]).length;
          return `
          <section class="panel inv-cab">
            <div><h2>${esc(i.nome)}</h2><span class="p-meta">${esc(nomeEscopo(i))}${i.cego ? '. Contagem às cegas: quem conta não vê o que o sistema espera.' : ''}</span></div>
            <div class="inv-prog"><strong>${contados} de ${total}</strong><span class="muted">contados</span><span class="onb-regua"><span style="width:${total ? Math.round((contados / total) * 100) : 0}%"></span></span></div>
          </section>
          <div id="inv-corpo">${corpoContagem()}</div><p class="table-foot">Cada número é salvo assim que você sai do campo. Várias pessoas podem contar ao mesmo tempo. Para o resultado ser exato, evite vender os produtos durante a contagem.</p>`;
        }
        E.atual = null;
        const abertosL = state.inventarios.filter((x) => x.status === 'aberto');
        const feitos = state.inventarios.filter((x) => x.status === 'concluido').sort((a, b) => num(b.concluidoEm) - num(a.concluidoEm));
        if (!abertosL.length && !feitos.length) {
          return A.emptyState('Nenhum inventário ainda',
            'O inventário confere o estoque do sistema com o que está na prateleira. A equipe conta pelo celular e, no fim, você vê as sobras, as faltas e o valor da diferença, com os ajustes lançados de uma vez.',
            A.pode('gerir') ? `<button class="btn btn-primary" data-action="inv-novo">${icon('plus')}Começar um inventário</button>` : '<p class="muted">Peça ao responsável ou ao gerente para abrir uma contagem.</p>');
        }
        const custoOk = A.pode('verCusto');
        return `
          ${abertosL.length ? `<section class="panel det-bloco"><header class="panel-head"><h2>Contagens em andamento</h2></header>
            <ul class="inv-lista">${abertosL.map((x) => { const t = produtosDo(x).length, c = produtosDo(x).filter((p) => (x.contagens || {})[p.id]).length; return `<li>
              <div><strong>${esc(x.nome)}</strong><span class="p-meta">${esc(nomeEscopo(x))}. ${c} de ${t} contados. Aberto por ${esc(A.nomeDe(x.criadoPor))}.</span></div>
              <button class="btn btn-primary btn-sm" data-action="inv-abrir" data-id="${x.id}">Continuar contagem</button></li>`; }).join('')}</ul></section>` : ''}
          ${feitos.length ? `<section class="panel det-bloco"><header class="panel-head"><h2>Inventários concluídos</h2></header>
            <div class="table-wrap flat"><table class="table">
              <thead><tr><th>Inventário</th><th>Concluído em</th><th class="num">Contados</th><th class="num">Com diferença</th>${custoOk ? '<th class="num">Faltas</th><th class="num">Sobras</th>' : ''}<th class="col-actions"><span class="sr-only">Ações</span></th></tr></thead>
              <tbody>${feitos.map((x) => { const r = x.resumo || {}; return `<tr>
                <td><span class="p-name">${esc(x.nome)}</span><span class="p-sku">${esc(nomeEscopo(x))}</span></td>
                <td class="nowrap">${x.concluidoEm ? dfd.format(x.concluidoEm) : ''}<span class="p-sku">${esc(A.nomeDe(x.concluidoPor))}</span></td>
                <td class="num">${num(r.contados)}</td><td class="num">${num(r.comDiferenca)}</td>
                ${custoOk ? `<td class="num"><b class="neg">${cf.format(-num(r.valorFaltas))}</b></td><td class="num"><b class="pos">${cf.format(num(r.valorSobras))}</b></td>` : ''}
                <td class="col-actions"><div class="row-actions"><button class="btn btn-sm" data-action="inv-relatorio" data-id="${x.id}">Ver relatório</button></div></td>
              </tr>`; }).join('')}</tbody></table></div></section>` : ''}`;
      }
    }
  };

  function novoInventario() {
    const usaLocais = A.recurso('multiloja') && state.locais.length >= 2;
    const m = A.openModal(`
      <form id="f-inv" novalidate>
        ${A.modalHead('Novo inventário')}
        <div class="modal-body">
          <label class="field"><span>Nome</span><input name="nome" maxlength="60" value="Inventário de ${dfd.format(Date.now())}"></label>
          <label class="field"><span>O que contar</span><select name="escopo">
            <option value="todos">Todos os produtos</option>
            ${A.sortedCats().map((c) => `<option value="categoria:${c.id}">Categoria ${esc(c.nome)}</option>`).join('')}
            ${usaLocais ? state.locais.map((l) => `<option value="local:${l.id}">Tudo o que está em ${esc(l.nome)}</option>`).join('') : ''}
          </select></label>
          <label class="check"><input type="checkbox" name="cego" checked> Contagem às cegas (quem conta não vê o que o sistema espera)</label>
          <p class="muted inv-dica">A contagem às cegas evita "contar para bater" e deixa o resultado mais confiável.</p>
          <p class="form-error" role="alert" hidden></p>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit">Começar a contagem</button></footer>
      </form>`);
    const form = A.$('#f-inv', m);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const [tipo, valor] = form.escopo.value.split(':');
      const dados = { nome: form.nome.value.trim() || `Inventário de ${dfd.format(Date.now())}`, escopo: { tipo, valor: valor || '' }, cego: form.cego.checked };
      if (!produtosDo(dados).length) return A.showFormError(form, 'Não há produtos nesse grupo.');
      const btn = form.querySelector('[type=submit]'); A.setBusy(btn, true);
      try { E.atual = await A.DB.salvarInventario(dados, state.user); A.closeModal(); A.render(); }
      catch (err) { A.showFormError(form, A.msgErro(err)); A.setBusy(btn, false); }
    });
  }

  function tabelaDif(lista, custoOk) {
    return `<div class="table-wrap flat"><table class="table">
      <thead><tr><th>Produto</th><th class="num">Sistema</th><th class="num">Contado</th><th class="num">Diferença</th>${custoOk ? '<th class="num">Valor</th>' : ''}</tr></thead>
      <tbody>${lista.map((d) => `<tr>
        <td><span class="p-name">${esc(d.nome)}</span>${d.naoContado ? '<span class="p-sku">Não contado</span>' : ''}</td>
        <td class="num">${nf.format(d.sistema)}</td><td class="num">${nf.format(d.contado)}</td>
        <td class="num"><b class="${d.dif < 0 ? 'neg' : 'pos'}">${d.dif > 0 ? '+' : ''}${nf.format(d.dif)}</b> <span class="muted">${esc(d.unidade || '')}</span></td>
        ${custoOk ? `<td class="num"><b class="${d.valor < 0 ? 'neg' : 'pos'}">${cf.format(d.valor)}</b></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  }

  function concluir() {
    const i = inv(); if (!i) return;
    const custoOk = A.pode('verCusto');
    const naoContados = produtosDo(i).filter((p) => !(i.contagens || {})[p.id]).length;
    const m = A.openModal(`
      <form id="f-inv-fim" novalidate>
        ${A.modalHead(`Concluir ${esc(i.nome)}`)}
        <div class="modal-body" id="inv-fim-corpo"></div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="close-modal">Continuar contando</button><button class="btn btn-primary" type="submit">Lançar ajustes e concluir</button></footer>
      </form>`, { wide: true });
    const form = A.$('#f-inv-fim', m);
    const corpo = A.$('#inv-fim-corpo', m);
    const desenhar = () => {
      const zerar = form.zerar ? form.zerar.checked : false;
      const difs = diferencas(i, zerar).filter((d) => d.dif !== 0);
      const faltas = difs.filter((d) => d.dif < 0), sobras = difs.filter((d) => d.dif > 0);
      corpo.innerHTML = `
        <section class="stats inv-stats">
          <div class="stat"><span class="stat-label">Contados</span><strong class="stat-value">${produtosDo(i).length - naoContados}</strong><span class="stat-sub">de ${produtosDo(i).length} produtos</span></div>
          <div class="stat ${faltas.length ? 'is-alert' : ''}"><span class="stat-label">Faltas</span><strong class="stat-value">${faltas.length}</strong><span class="stat-sub">${custoOk ? cf.format(faltas.reduce((s, d) => s + d.valor, 0)) : 'produtos'}</span></div>
          <div class="stat"><span class="stat-label">Sobras</span><strong class="stat-value">${sobras.length}</strong><span class="stat-sub">${custoOk ? cf.format(sobras.reduce((s, d) => s + d.valor, 0)) : 'produtos'}</span></div>
        </section>
        ${naoContados ? `<label class="check inv-zerar"><input type="checkbox" name="zerar" ${zerar ? 'checked' : ''}> Considerar zerados os ${plural(naoContados, 'produto não contado', 'produtos não contados')} (se não marcar, eles ficam como estão)</label>` : ''}
        ${difs.length ? tabelaDif(difs, custoOk) : '<p class="confirm-text">Nenhuma diferença: o estoque do sistema confere com a contagem.</p>'}
        <p class="muted">Os ajustes entram no histórico com a observação "${esc(i.nome)}". O saldo do sistema considerado é o de agora.</p>
        <p class="form-error" role="alert" hidden></p>`;
      if (form.zerar) form.zerar.onchange = desenhar;
    };
    desenhar();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const zerar = form.zerar ? form.zerar.checked : false;
      const difs = diferencas(i, zerar).filter((d) => d.dif !== 0);
      const btn = form.querySelector('[type=submit]'); A.setBusy(btn, true, 'Lançando ajustes…');
      const local = i.escopo && i.escopo.tipo === 'local' ? state.locais.find((l) => l.id === i.escopo.valor) : null;
      let feitos = 0;
      try {
        for (const d of difs) {
          try {
            await A.DB.addMovement({ produtoId: d.produtoId, tipo: 'ajuste', quantidade: d.contado, observacao: i.nome,
              lote: { lote: 'Inventário', validade: null }, localId: local ? local.id : undefined, localNome: local ? local.nome : '', localPadrao: (padrao() || {}).id }, state.user);
          } catch (err) { if (!/igual ao estoque/.test(err.message)) throw err; }
          btn.textContent = `Lançando ajustes… ${++feitos} de ${difs.length}`;
        }
        const faltas = difs.filter((d) => d.dif < 0), sobras = difs.filter((d) => d.dif > 0);
        await A.DB.salvarInventario({ id: i.id, status: 'concluido', concluidoEm: Date.now(), concluidoPor: state.user.email, diferencas: difs,
          resumo: { contados: produtosDo(i).filter((p) => (i.contagens || {})[p.id]).length, comDiferenca: difs.length,
            valorFaltas: Math.abs(faltas.reduce((s, x) => s + x.valor, 0)), valorSobras: sobras.reduce((s, x) => s + x.valor, 0) } }, state.user);
        E.atual = null; A.closeModal(); A.render();
        A.toast(difs.length ? `Inventário concluído: ${plural(difs.length, 'ajuste lançado', 'ajustes lançados')}.` : 'Inventário concluído, sem diferenças.');
      } catch (err) {
        A.showFormError(form, `${A.msgErro(err)} ${feitos ? `${feitos} ajuste(s) já foram lançados; concluir de novo lança só o que falta.` : ''}`);
        A.setBusy(btn, false);
      }
    });
  }

  function relatorio(id) {
    const i = state.inventarios.find((x) => x.id === id); if (!i) return;
    const custoOk = A.pode('verCusto');
    const difs = i.diferencas || [];
    const m = A.openModal(`${A.modalHead(esc(i.nome))}
      <div class="modal-body">
        <p class="confirm-text">${esc(nomeEscopo(i))}. Concluído em ${i.concluidoEm ? df.format(i.concluidoEm) : ''} por ${esc(A.nomeDe(i.concluidoPor))}.</p>
        ${difs.length ? tabelaDif(difs, custoOk) : '<p class="confirm-text">Sem diferenças: o estoque conferiu.</p>'}
      </div>
      <footer class="modal-foot"><button class="btn" data-action="close-modal">Fechar</button>${difs.length ? `<button class="btn btn-primary" data-inv-csv>${icon('exportar')}Exportar CSV</button>` : ''}</footer>`, { wide: true });
    const b = A.$('[data-inv-csv]', m);
    if (b) b.onclick = () => A.baixarCSV(`${A.slug()}-${A.norm(i.nome).replace(/[^a-z0-9]+/g, '-')}.csv`,
      [['Produto', 'Sistema', 'Contado', 'Diferença', 'Unidade', ...(custoOk ? ['Valor (R$)'] : [])], ...difs.map((d) => [d.nome, d.sistema, d.contado, d.dif, d.unidade, ...(custoOk ? [d.valor] : [])])]);
  }

  const acoes = {
    'inv-novo': novoInventario,
    'inv-abrir': (t) => { E.atual = t.dataset.id; E.busca = ''; A.render(); },
    'inv-voltar': () => { E.atual = null; A.render(); },
    'inv-concluir': concluir,
    'inv-relatorio': (t) => relatorio(t.dataset.id)
  };

  return {
    rotas: { inventario: { titulo: 'Inventário', recurso: 'lotes', perm: 'estoque', vitrine: 'Confira o estoque do sistema com o da prateleira. A equipe conta pelo celular e o relatório mostra sobras, faltas e o valor da diferença, com os ajustes lançados de uma vez.' } },
    views, acoes,
    icones: { inventario: '<path d="M9 4h6v3H9z"/><path d="M7 5H5v16h14V5h-2"/><path d="M8.5 12.5l2 2 4-4M8.5 17.5h7"/>' },
    _teste: { diferencas, saldo, produtosDo }
  };
});
