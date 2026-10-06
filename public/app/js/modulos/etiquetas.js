/*
 * Estokio — Etiquetas (plano Pro e Premium).
 * Etiquetas com nome, preço, código e código de barras (EAN-13 ou Code 128, gerados em js/modulos/codigos.js).
 * Modelos de folha A4/Carta e de impressora térmica, com ajuste fino em milímetros e posição inicial
 * (para reaproveitar uma folha já começada). Imprime pelo navegador; "Salvar como PDF" também funciona.
 */
(window.EstokioModulos = window.EstokioModulos || []).push(function (A) {
  'use strict';
  const { state, esc, num, cf, plural, icon } = A;
  const Cod = window.EstokioCodigos;

  const MODELOS = {
    'a4-3x11': { nome: 'Folha A4, 3 x 11 (70 x 25,4 mm)', pw: 210, ph: 297, cols: 3, rows: 11, w: 70, h: 25.4, top: 8.8, left: 0, gx: 0, gy: 0 },
    'a4-3x8': { nome: 'Folha A4, 3 x 8 (63,5 x 33,9 mm)', pw: 210, ph: 297, cols: 3, rows: 8, w: 63.5, h: 33.9, top: 12.9, left: 7.25, gx: 2.5, gy: 0 },
    'carta-3x10': { nome: 'Folha Carta, 3 x 10 (66,7 x 25,4 mm)', pw: 215.9, ph: 279.4, cols: 3, rows: 10, w: 66.7, h: 25.4, top: 12.7, left: 4.8, gx: 3.2, gy: 0 },
    'termica-40x25': { nome: 'Impressora térmica, 40 x 25 mm', pw: 40, ph: 25, cols: 1, rows: 1, w: 40, h: 25, top: 0, left: 0, gx: 0, gy: 0, rolo: true },
    'termica-50x30': { nome: 'Impressora térmica, 50 x 30 mm', pw: 50, ph: 30, cols: 1, rows: 1, w: 50, h: 30, top: 0, left: 0, gx: 0, gy: 0, rolo: true },
    'termica-60x40': { nome: 'Impressora térmica, 60 x 40 mm', pw: 60, ph: 40, cols: 1, rows: 1, w: 60, h: 40, top: 0, left: 0, gx: 0, gy: 0, rolo: true }
  };
  const CAMPOS = [['nome', 'Nome do produto'], ['preco', 'Preço de venda'], ['barras', 'Código de barras'], ['sku', 'Código (SKU)'], ['empresa', 'Nome da empresa']];

  function carregarCfg() {
    const padrao = { modelo: 'a4-3x11', campos: { nome: true, preco: true, barras: true, sku: false, empresa: false }, ajX: 0, ajY: 0, inicio: 1 };
    try { const c = JSON.parse(localStorage.getItem('estokio:etiquetas') || '{}'); return { ...padrao, ...c, campos: { ...padrao.campos, ...(c.campos || {}) }, inicio: 1 }; }
    catch (e) { return padrao; }
  }
  const E = { cfg: carregarCfg(), sel: {}, q: '' };
  const salvarCfg = () => { try { localStorage.setItem('estokio:etiquetas', JSON.stringify({ ...E.cfg, inicio: 1 })); } catch (e) { /* sem armazenamento */ } };
  const modelo = () => MODELOS[E.cfg.modelo] || MODELOS['a4-3x11'];
  const codigoDe = (p) => p.codigoBarras || p.sku || p.id.slice(0, 10).toUpperCase();

  /** HTML de uma etiqueta, dimensionada em milímetros. */
  function etiqueta(p, m) {
    const c = E.cfg.campos;
    const base = Math.min(m.h, m.w / 2.2);
    const fs = (f) => `${(base * f).toFixed(2)}mm`;
    // Barras esticadas na vertical (ocupam a altura livre); o número vai embaixo como texto
    const barras = c.barras ? Cod.codigoBarras(codigoDe(p), { altura: 40, modulo: 2, legenda: false, esticar: true }) : null;
    return `<div class="etq" style="width:${m.w}mm;height:${m.h}mm;padding:${(base * 0.07).toFixed(2)}mm ${(base * 0.09).toFixed(2)}mm">
      ${c.empresa ? `<div class="etq-emp" style="font-size:${fs(0.1)}">${esc(state.empresa.nome)}</div>` : ''}
      ${c.nome ? `<div class="etq-nome" style="font-size:${fs(c.barras ? 0.13 : 0.17)}">${esc(p.nome)}</div>` : ''}
      ${c.preco || c.sku ? `<div class="etq-linha">${c.preco ? `<span class="etq-preco" style="font-size:${fs(c.barras ? 0.2 : 0.3)}">${cf.format(num(p.preco))}</span>` : ''}${c.sku && p.sku ? `<span class="etq-sku" style="font-size:${fs(0.1)}">${esc(p.sku)}</span>` : ''}</div>` : ''}
      ${barras ? `<div class="etq-barras">${barras.svg}</div><div class="etq-cod" style="font-size:${fs(0.1)}">${esc(barras.texto)}</div>` : ''}
    </div>`;
  }

  /** Lista de etiquetas na ordem, com posições vazias no começo (folha já usada). */
  function lista() {
    const m = modelo();
    const itens = [];
    if (!m.rolo) for (let i = 1; i < Math.max(1, Math.round(num(E.cfg.inicio))); i++) itens.push(null);
    for (const p of A.sortedProds()) { const q = Math.round(num(E.sel[p.id])); for (let i = 0; i < q; i++) itens.push(p); }
    return itens;
  }
  function paginas(itens) {
    const m = modelo();
    const porPag = m.cols * m.rows;
    const out = [];
    for (let i = 0; i < itens.length; i += porPag) out.push(itens.slice(i, i + porPag));
    return out;
  }
  function pagina(itens, m) {
    return `<div class="etq-pagina" style="width:${m.pw}mm;height:${m.ph}mm;padding-top:${m.top + num(E.cfg.ajY)}mm;padding-left:${m.left + num(E.cfg.ajX)}mm;grid-template-columns:repeat(${m.cols}, ${m.w}mm);grid-auto-rows:${m.h}mm;column-gap:${m.gx}mm;row-gap:${m.gy}mm">
      ${itens.map((p) => (p ? etiqueta(p, m) : `<div class="etq etq-vazia" style="width:${m.w}mm;height:${m.h}mm"></div>`)).join('')}
    </div>`;
  }

  document.addEventListener('input', aoMudar);
  document.addEventListener('change', aoMudar);
  function aoMudar(e) {
    const d = e.target.dataset || {};
    if (d.etqCfg) {
      const k = d.etqCfg;
      E.cfg[k] = e.target.type === 'number' ? num(e.target.value) : e.target.value;
      salvarCfg();
      if (e.type === 'change' || e.target.type === 'number') atualizarPrevia();
      if (k === 'modelo' && e.type === 'change') A.refresh();
    } else if (d.etqCampo && e.type === 'change') {
      E.cfg.campos[d.etqCampo] = e.target.checked; salvarCfg(); atualizarPrevia();
    } else if (d.etqQtd) {
      const v = Math.max(0, Math.round(num(e.target.value)));
      if (v) E.sel[d.etqQtd] = v; else delete E.sel[d.etqQtd];
      atualizarPrevia();
      if (e.type === 'change' && !v) A.refresh();
    } else if (d.etqBusca !== undefined && e.type === 'input') {
      E.q = e.target.value;
      const box = document.getElementById('etq-achados');
      if (box) box.innerHTML = achados();
    }
  }

  function achados() {
    const qq = A.norm(E.q);
    const ps = A.sortedProds().filter((p) => !E.sel[p.id] && (!qq || A.norm(`${p.nome} ${p.sku} ${p.codigoBarras}`).includes(qq))).slice(0, 12);
    if (!ps.length) return '<p class="muted etq-nada">Nenhum produto encontrado.</p>';
    return ps.map((p) => `<button type="button" class="etq-achado" data-action="etq-add" data-id="${p.id}"><span class="p-name">${esc(p.nome)}</span><span class="p-sku">${esc(p.sku || '')} ${cf.format(num(p.preco))}</span>${icon('plus')}</button>`).join('');
  }

  function atualizarPrevia() {
    const box = document.getElementById('etq-previa');
    if (!box) return;
    const m = modelo();
    const itens = lista();
    const pgs = paginas(itens);
    const total = itens.filter(Boolean).length;
    const info = document.getElementById('etq-info');
    if (info) info.textContent = total ? `${plural(total, 'etiqueta', 'etiquetas')}${m.rolo ? '' : ` em ${plural(pgs.length, 'folha', 'folhas')}`}` : 'Nenhuma etiqueta escolhida';
    if (!total) { box.innerHTML = '<p class="muted etq-nada">Escolha os produtos para ver a prévia.</p>'; return; }
    const pxmm = 3.7795;
    const larg = Math.min(box.clientWidth || 460, m.rolo ? 260 : 460);
    const escala = larg / (m.pw * pxmm);
    box.innerHTML = `<div class="etq-escala" style="width:${m.pw * pxmm * escala}px;height:${m.ph * pxmm * escala}px"><div style="transform:scale(${escala});transform-origin:0 0">${pagina(pgs[0], m)}</div></div>
      ${pgs.length > 1 ? `<p class="muted etq-nada">Prévia da primeira ${m.rolo ? 'etiqueta' : 'folha'}.</p>` : ''}`;
  }

  const views = {
    etiquetas: {
      actions: () => `<button class="btn btn-primary" data-action="etq-imprimir">${icon('imprimir')}Imprimir etiquetas</button>`,
      shell: () => {
        const m = modelo();
        return `
        <div class="etq-layout">
          <section class="panel etq-painel">
            <header class="panel-head"><h2>Modelo e conteúdo</h2></header>
            <div class="modal-body">
              <label class="field"><span>Modelo</span><select data-etq-cfg="modelo">${Object.entries(MODELOS).map(([k, x]) => `<option value="${k}" ${E.cfg.modelo === k ? 'selected' : ''}>${x.nome}</option>`).join('')}</select></label>
              <fieldset class="field etq-campos"><legend>O que aparece</legend>
                ${CAMPOS.map(([k, t]) => `<label class="check"><input type="checkbox" data-etq-campo="${k}" ${E.cfg.campos[k] ? 'checked' : ''}> ${t}</label>`).join('')}
              </fieldset>
              ${m.rolo ? '' : `<label class="field"><span>Começar na etiqueta nº</span><input type="number" min="1" max="${m.cols * m.rows}" step="1" value="${E.cfg.inicio}" data-etq-cfg="inicio"></label>`}
              <details class="codigo-det"><summary>Ajuste fino da impressão</summary>
                <div class="grid-2">
                  <label class="field"><span>Mover para a direita (mm)</span><input type="number" step="0.5" value="${E.cfg.ajX}" data-etq-cfg="ajX"></label>
                  <label class="field"><span>Mover para baixo (mm)</span><input type="number" step="0.5" value="${E.cfg.ajY}" data-etq-cfg="ajY"></label>
                </div>
                <p class="muted etq-dica">Imprima uma folha comum antes e compare com a de etiquetas contra a luz. Use valores negativos para mover para a esquerda ou para cima. Na impressão, escolha "tamanho real" ou escala de 100%.</p>
              </details>
            </div>
          </section>
          <section class="panel etq-painel">
            <header class="panel-head"><h2>Produtos</h2></header>
            <div class="modal-body">
              <label class="search">${icon('busca')}<input type="search" data-etq-busca value="${esc(E.q)}" placeholder="Buscar produto para adicionar" aria-label="Buscar produto"></label>
              <div id="etq-achados" class="etq-achados">${achados()}</div>
              <div id="view-body"></div>
            </div>
          </section>
          <section class="panel etq-painel etq-prev-painel">
            <header class="panel-head"><h2>Prévia</h2><span class="p-meta" id="etq-info"></span></header>
            <div class="modal-body"><div id="etq-previa" class="etq-previa"></div></div>
          </section>
        </div>`;
      },
      body() {
        const ps = A.sortedProds().filter((p) => E.sel[p.id]);
        setTimeout(atualizarPrevia, 0);
        if (!ps.length) return '<p class="muted etq-nada">Adicione produtos pela busca acima.</p>';
        return `<div class="etq-sel-acoes"><span class="muted">${plural(ps.length, 'produto escolhido', 'produtos escolhidos')}</span>
          <button class="btn btn-sm" data-action="etq-todos">Quantidade = estoque</button><button class="btn btn-sm" data-action="etq-limpar">Limpar</button></div>
          <ul class="etq-sel">${ps.map((p) => `<li>
          <div class="people-info"><span class="p-name">${esc(p.nome)}</span><span class="p-sku">${esc(codigoDe(p))}, ${cf.format(num(p.preco))}</span></div>
          <input type="number" min="0" step="1" value="${E.sel[p.id]}" data-etq-qtd="${p.id}" class="qtd-input" aria-label="Quantidade de etiquetas de ${esc(p.nome)}">
          <button type="button" class="icon-btn i-del" data-action="etq-tirar" data-id="${p.id}" aria-label="Tirar ${esc(p.nome)}">${icon('excluir')}</button>
        </li>`).join('')}</ul>`;
      },
      mount: () => setTimeout(atualizarPrevia, 0)
    }
  };

  function imprimir() {
    const itens = lista();
    if (!itens.filter(Boolean).length) return A.toast('Escolha pelo menos um produto.', 'erro');
    const m = modelo();
    let raiz = document.getElementById('print-root');
    if (!raiz) { raiz = document.createElement('div'); raiz.id = 'print-root'; document.body.appendChild(raiz); }
    raiz.innerHTML = `<style>@page { size: ${m.pw}mm ${m.ph}mm; margin: 0; }</style>` + paginas(itens).map((pg) => pagina(pg, m)).join('');
    document.body.classList.add('imprimindo-etiquetas');
    const fim = () => { document.body.classList.remove('imprimindo-etiquetas'); raiz.innerHTML = ''; window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim);
    window.print();
    setTimeout(() => { if (document.body.classList.contains('imprimindo-etiquetas')) fim(); }, 2000);
  }

  const acoes = {
    'etq-add'(t) { E.sel[t.dataset.id] = 1; E.q = ''; A.render(); },
    'etq-tirar'(t) { delete E.sel[t.dataset.id]; A.render(); },
    'etq-limpar'() { E.sel = {}; A.render(); },
    'etq-todos'() {
      const alvo = Object.keys(E.sel).length ? A.sortedProds().filter((p) => E.sel[p.id]) : A.sortedProds();
      alvo.forEach((p) => { const q = Math.round(num(p.quantidade)); if (q > 0) E.sel[p.id] = q; else delete E.sel[p.id]; });
      A.render();
    },
    'etq-imprimir': imprimir,
    /** Atalho vindo de outras telas: etiquetas de um produto. */
    'etiquetas-produto'(t) { E.sel = { [t.dataset.id]: Math.max(1, Math.round(num((A.prodById(t.dataset.id) || {}).quantidade))) }; location.hash = '#/etiquetas'; }
  };

  return {
    rotas: { etiquetas: { titulo: 'Etiquetas', recurso: 'etiquetas', perm: 'estoque', vitrine: 'Imprima etiquetas com código de barras, nome e preço, em folhas A4 ou Carta ou em impressora térmica de rolo, com prévia antes de imprimir.' } },
    views, acoes,
    hooks: {
      acoesLinha(p) { return A.recurso('etiquetas') ? `<button class="icon-btn" data-action="etiquetas-produto" data-id="${p.id}" title="Imprimir etiquetas" aria-label="Imprimir etiquetas de ${esc(p.nome)}">${icon('etiqueta')}</button>` : ''; }
    },
    icones: { etiqueta: '<path d="M3 12V4h8l9 9-8 8z"/><path d="M7 8h.01M9 14l3 3M11 12l3 3"/>' },
    _teste: { E, MODELOS, lista, paginas, pagina }
  };
});
