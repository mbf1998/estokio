/*
 * Estokio — página inicial.
 * - Palavra que alterna no título (tipos de negócio).
 * - Miniatura AO VIVO do sistema (app/index.html?demo=1&embed=1), carregada depois da página.
 * - Faixa de segmentos rolando.
 * - Planos (três preços cada) e WhatsApp lidos do Firestore (API pública, sem login), com reserva padrão.
 * Usa a mesma configuração do gestor: app/js/firebase-config.js.
 */
(function () {
  'use strict';

  const cfg = window.ESTOKIO_FIREBASE_CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const cf = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const calmo = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('#ano').textContent = new Date().getFullYear();

  /* ---------- palavra que alterna ---------- */
  const PALAVRAS = ['mercearia', 'farmácia', 'loja de roupas', 'distribuidora', 'casa de ração', 'papelaria', 'loja de autopeças', 'padaria']; // todas femininas: vêm depois de "da sua"
  const rot = $('#rotativo');
  if (rot && !calmo) {
    let i = 0;
    setInterval(() => {
      rot.classList.add('troca');
      setTimeout(() => { i = (i + 1) % PALAVRAS.length; rot.textContent = PALAVRAS[i]; rot.classList.remove('troca'); }, 260);
    }, 2400);
  }

  /* ---------- miniatura ao vivo do sistema ---------- */
  const tela = $('#vitrine-tela'), frame = $('#vitrine-frame');
  const ajustar = () => { if (tela && frame) frame.style.transform = `scale(${tela.clientWidth / 1280})`; };
  ajustar();
  if (window.ResizeObserver && tela) new ResizeObserver(ajustar).observe(tela); else window.addEventListener('resize', ajustar);
  // Carrega depois da página, para não atrasar a abertura
  window.addEventListener('load', () => setTimeout(() => { if (frame && !frame.src) frame.src = frame.dataset.src; }, 300));

  /* ---------- faixa de segmentos ---------- */
  const ICO = {
    mercado: '<path d="M3 4h2l2.4 11h11L21 7H6.2"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
    farmacia: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
    roupa: '<path d="M8 4l4 2 4-2 4 4-3 3v9H7v-9L4 8z"/>',
    pet: '<circle cx="7" cy="9" r="1.8"/><circle cx="12" cy="6.5" r="1.8"/><circle cx="17" cy="9" r="1.8"/><path d="M8 16c0-2.5 1.8-4 4-4s4 1.5 4 4-2 3-4 3-4-.5-4-3z"/>',
    caixa: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
    papel: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
    auto: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
    obra: '<path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/>',
    padaria: '<path d="M4 14c0-4 3.6-7 8-7s8 3 8 7v3H4z"/><path d="M9 10v4M12 9v5M15 10v4"/>'
  };
  const SEGS = [['mercado', 'Mercadinhos'], ['farmacia', 'Farmácias'], ['roupa', 'Lojas de roupas'], ['pet', 'Pet shops'], ['caixa', 'Distribuidoras'],
    ['papel', 'Papelarias'], ['auto', 'Autopeças'], ['obra', 'Material de construção'], ['padaria', 'Padarias']];
  const itens = SEGS.map(([k, t]) => `<li><svg viewBox="0 0 24 24" aria-hidden="true">${ICO[k]}</svg>${t}</li>`).join('');
  const lista = $('#segfaixa');
  if (lista) {
    lista.innerHTML = itens;
    // segunda cópia para a faixa rolar sem emenda
    const copia = lista.cloneNode(true); copia.removeAttribute('id'); copia.setAttribute('aria-hidden', 'true');
    lista.parentNode.appendChild(copia);
  }

  /* ---------- planos: o catálogo vem do módulo compartilhado (app/js/assinatura.js) ---------- */
  const Ass = window.EstokioAssinatura;
  let planosAtuais = Ass.planosPadrao();      // troca pelos do Firestore quando a leitura funcionar
  let periodo = 'anual';
  const nf = new Intl.NumberFormat('pt-BR');

  /** Qual plano costuma servir para cada tipo de negócio. */
  const SEGMENTOS = [
    { nome: 'Pequeno comércio começando', dor: 'Saindo do caderno ou da planilha, com uma ou duas pessoas no balcão.', plano: 'basico', porque: 'Estoque, aviso de reposição e lista de compras, sem pagar por mais.' },
    { nome: 'Mercadinho e farmácia', dor: 'Produto vencendo na prateleira e nota de fornecedor para lançar toda semana.', plano: 'pro', porque: 'Validade e lotes, inventário, NF-e e etiquetas de prateleira.' },
    { nome: 'Loja de roupas, calçados e brindes', dor: 'Cada modelo em vários tamanhos e cores, cada um com o seu estoque.', plano: 'pro', porque: 'Grade de tamanho e cor, kits e etiquetas.' },
    { nome: 'Material de construção e autopeças', dor: 'Milhares de itens, compra por nota fiscal e dinheiro parado em prateleira.', plano: 'pro', porque: 'NF-e e etiquetas. Para ver o que está parado, o Premium traz relatórios.' },
    { nome: 'Distribuidora e atacado', dor: 'Muita gente mexendo no estoque e compras em volume.', plano: 'premium', porque: 'Até 10 usuários, relatórios com curva ABC e suporte prioritário.' },
    { nome: 'Loja com depósito ou mais de uma loja', dor: 'A mesma mercadoria em lugares diferentes, com transferência entre eles.', plano: 'premium', porque: 'Multiloja, com estoque separado e transferências.' }
  ];

  /* ---------- leitura do Firestore pela API REST ---------- */
  function valor(v) {
    if (!v) return undefined;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('nullValue' in v) return null;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(valor);
    if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, valor(x)]));
    return undefined;
  }
  async function lerColecao(nome) {
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/databases/(default)/documents/${nome}?pageSize=100&key=${encodeURIComponent(cfg.apiKey)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Firestore respondeu ${r.status}`);
    const j = await r.json();
    return (j.documents || []).map((d) => ({ id: d.name.split('/').pop(), ...valor({ mapValue: { fields: d.fields || {} } }) }));
  }

  /* ---------- montagem ---------- */
  const LINHAS = [
    ['Usuários', (p) => `${p.maxUsuarios}`],
    ['Produtos', (p) => (num(p.maxProdutos) ? `até ${nf.format(num(p.maxProdutos))}` : 'ilimitados')],
    ['Entradas, saídas, ajustes e histórico completo', () => true],
    ['Painel, aviso de reposição e previsão de quando acaba', () => true],
    ['Leitor de código de barras pelo celular', (p) => p.recursos.leitor],
    ['Importação de planilha', (p) => p.recursos.importacao],
    ['Lista de compras e pedidos de compra com recebimento', (p) => p.recursos.compras],
    ['Permissões por pessoa: gerente, estoquista e caixa', () => true],
    ['Entrada pelo XML da nota fiscal (NF-e)', (p) => p.recursos.nfe],
    ['Validade, lotes e inventário', (p) => p.recursos.lotes],
    ['Grade de tamanho e cor', (p) => p.recursos.grade],
    ['Kits e combos', (p) => p.recursos.kits],
    ['Etiquetas com código de barras', (p) => p.recursos.etiquetas],
    ['Relatórios: curva ABC, giro, parados e PDF', (p) => p.recursos.relatorios],
    ['Multiloja: lojas, depósitos e transferências', (p) => p.recursos.multiloja],
    ['Integração com lojas online (em breve)', (p) => p.recursos.integracao],
    ['Suporte prioritário pelo WhatsApp', (p) => p.suportePrioritario]
  ];

  function montar() {
    const planos = Ass.planosVendaveis(planosAtuais).map((p) => ({ ...p, recursos: { ...Ass.BASE, ...(p.recursos || {}) } }));
    const per = Ass.periodoDe(periodo);

    $('#periodos-pg').innerHTML = Ass.PERIODOS.map((x) => {
      const r = planos[0] ? Ass.rotuloDesconto(planos[0], x.id) : '';
      return `<button type="button" role="radio" aria-checked="${x.id === periodo}" data-periodo="${x.id}" class="${x.id === periodo ? 'is-sel' : ''}">${x.nome}${r ? `<small>${r}</small>` : ''}</button>`;
    }).join('');

    $('#planos-lista').innerHTML = planos.map((p, i) => {
      const novos = Ass.novidadesDoPlano(p, planosAtuais).map((k) => Ass.NOMES_RECURSOS[k] + (k === 'integracao' ? ' (em breve)' : ''));
      if (p.suportePrioritario) novos.push('Suporte prioritário pelo WhatsApp');
      return `<article class="plano ${p.destaque ? 'plano-destaque' : ''}">
        ${p.destaque ? '<span class="plano-selo">Mais escolhido</span>' : ''}
        <h3>${esc(p.nome)}</h3>
        <p class="plano-desc">${esc(p.descricao || '')}</p>
        <p class="plano-preco">${cf.format(Ass.preco(p, per.id))}<span>${per.curto}</span></p>
        <p class="plano-eq">${per.meses > 1 ? `${cf.format(Ass.equivalenteMes(p, per.id))} por mês` : 'Sem compromisso: renove quando quiser'}</p>
        <ul class="plano-itens">
          <li>Até ${plural(num(p.maxUsuarios), 'usuário', 'usuários')}</li>
          <li>${num(p.maxProdutos) ? `Até ${nf.format(num(p.maxProdutos))} produtos` : 'Produtos ilimitados'}</li>
          ${i > 0 ? `<li class="base">Tudo do ${esc(planos[i - 1].nome)}, mais:</li>` : ''}
          ${novos.map((n) => `<li>${esc(n)}</li>`).join('')}
        </ul>
        <a class="pilula ${p.destaque ? 'pilula-cheia' : 'pilula-contorno'}" href="app/index.html?cadastro=1">Começar teste grátis</a>
      </article>`;
    }).join('') || '<p class="bloco-intro">Os planos estão sendo atualizados. Fale com a gente pelo WhatsApp.</p>';

    $('#tabela-comp').innerHTML = `<thead><tr><th scope="col"><span class="sr-only">Recurso</span></th>${planos.map((p) => `<th scope="col" class="${p.destaque ? 'col-dest' : ''}">${esc(p.nome)}<small>${cf.format(Ass.preco(p, per.id))} ${per.curto}</small></th>`).join('')}</tr></thead>
      <tbody>${LINHAS.map(([nome, f]) => `<tr><th scope="row">${esc(nome)}</th>${planos.map((p) => {
        const v = f(p);
        return `<td class="${p.destaque ? 'col-dest' : ''}">${typeof v === 'string' ? `<strong>${esc(v)}</strong>` : v ? '<span class="ok" aria-label="Incluído">✓</span>' : '<span class="no" aria-label="Não incluído">—</span>'}</td>`;
      }).join('')}</tr>`).join('')}</tbody>`;

    const porId = Object.fromEntries(planos.map((p) => [p.id, p]));
    $('#segmentos').innerHTML = SEGMENTOS.map((sg) => {
      const pl = porId[sg.plano];
      return `<article class="seg">
        <h3>${esc(sg.nome)}</h3>
        <p>${esc(sg.dor)}</p>
        <div class="seg-pacotes">${pl ? `<span class="seg-pk"><strong>${esc(pl.nome)}</strong> a partir de ${cf.format(Ass.preco(pl, 'mensal'))}/mês</span>` : ''}</div>
        <p class="seg-porque">${esc(sg.porque)}</p>
      </article>`;
    }).join('');
  }
  $('#periodos-pg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-periodo]');
    if (b) { periodo = b.dataset.periodo; montar(); }
  });

  montar();
  const temFirebase = cfg.projectId && cfg.apiKey && window.fetch;
  if (temFirebase) {
    lerColecao('planos')
      .then((planos) => { if (Ass.planosVendaveis(planos).length) { planosAtuais = planos; montar(); } })
      .catch((e) => { console.warn('Página inicial: usando os preços padrão.', e.message); });
    // WhatsApp do suporte (Configurações do painel admin)
    fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/databases/(default)/documents/config/publico?key=${encodeURIComponent(cfg.apiKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const zap = d && d.fields && d.fields.whatsappSuporte ? String(valor(d.fields.whatsappSuporte) || '').replace(/\D/g, '') : '';
        if (!zap) return;
        const numero = zap.length <= 11 ? `55${zap}` : zap;
        $$('[data-whatsapp]').forEach((a) => {
          a.href = `https://wa.me/${numero}?text=${encodeURIComponent('Olá! Quero saber mais sobre o Estokio.')}`;
          a.target = '_blank'; a.rel = 'noopener'; a.hidden = false;
        });
      })
      .catch(() => {});
  }
})();
