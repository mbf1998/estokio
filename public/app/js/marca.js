/*
 * Estokio — personalização visual (cores e logo da empresa)
 * Usado pelo app e pela tela de configuração.
 */
(function () {
  'use strict';

  const PADRAO = { corPrimaria: '#16233A', corDestaque: '#F2B705' };
  const hexOk = (h) => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h);

  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hex(r, g, b) { return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join(''); }
  function luminancia(h) {
    const c = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  /** Mistura a cor a com b; t = quanto de b (0 a 1). */
  function misturar(a, b, t) { const x = rgb(a), y = rgb(b); return hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); }
  const ehClara = (h) => luminancia(h) > 0.42;
  const tintaSobre = (h) => (ehClara(h) ? '#16233A' : '#FFFFFF');

  /** Variáveis CSS derivadas de um par de cores. */
  function variaveis(corPrimaria, corDestaque) {
    const p = hexOk(corPrimaria) ? corPrimaria : PADRAO.corPrimaria;
    const d = hexOk(corDestaque) ? corDestaque : PADRAO.corDestaque;
    const fg = tintaSobre(p);
    return {
      '--side': p,
      '--side-fg': fg,
      '--side-text': misturar(fg, p, 0.28),
      '--side-2': misturar(p, fg, 0.1),
      '--tape': d,
      '--tape-hover': misturar(d, ehClara(d) ? '#000000' : '#FFFFFF', 0.12),
      '--tape-ink': tintaSobre(d),
      '--gauge': ehClara(p) ? '#5A6A7F' : p
    };
  }

  function aplicar(empresa, alvo) {
    const el = alvo || document.documentElement;
    const v = variaveis(empresa && empresa.corPrimaria, empresa && empresa.corDestaque);
    Object.entries(v).forEach(([k, val]) => el.style.setProperty(k, val));
    if (!alvo) {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', v['--side']);
    }
  }

  function limpar() {
    const el = document.documentElement;
    Object.keys(variaveis()).forEach((k) => el.style.removeProperty(k));
  }

  function iniciais(nome) {
    const limpo = String(nome || '').split('@')[0].replace(/[^\p{L}\p{N}\s]/gu, ' ');
    const partes = limpo.trim().split(/\s+/).filter((p) => p.length > 2 || /^[A-Z0-9]/.test(p));
    if (!partes.length) return '?';
    const s = partes[0][0] + (partes[1] ? partes[1][0] : (partes[0][1] || ''));
    return s.toUpperCase();
  }

  /**
   * Lê uma imagem enviada pelo usuário, reduz para no máximo 320 px
   * e devolve em base64 (data URL), pronta para salvar no Firestore.
   */
  function processarLogo(arquivo) {
    return new Promise((resolve, reject) => {
      if (!arquivo || !/^image\//.test(arquivo.type)) return reject(new Error('Escolha um arquivo de imagem (PNG, JPG, SVG ou WEBP).'));
      if (arquivo.size > 8 * 1024 * 1024) return reject(new Error('A imagem tem mais de 8 MB. Escolha uma menor.'));
      const leitor = new FileReader();
      leitor.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      leitor.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Esse arquivo de imagem não abriu. Tente PNG ou JPG.'));
        img.onload = () => {
          const MAX = 320;
          const w0 = img.naturalWidth || MAX, h0 = img.naturalHeight || MAX;
          const k = Math.min(1, MAX / Math.max(w0, h0));
          const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          let url = c.toDataURL('image/webp', 0.9);
          if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/png');
          if (url.length > 380000) url = c.toDataURL('image/jpeg', 0.8);
          if (url.length > 380000) return reject(new Error('A imagem ficou grande demais mesmo reduzida. Use um logo mais simples.'));
          resolve(url);
        };
        img.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  const COMBINACOES = [
    { nome: 'Estokio', corPrimaria: '#16233A', corDestaque: '#F2B705' },
    { nome: 'Floresta', corPrimaria: '#123B2C', corDestaque: '#7BD389' },
    { nome: 'Vinho', corPrimaria: '#3E0F24', corDestaque: '#FF9F5A' },
    { nome: 'Grafite', corPrimaria: '#26262B', corDestaque: '#4FC3F7' },
    { nome: 'Oceano', corPrimaria: '#0B3C5D', corDestaque: '#F4A259' },
    { nome: 'Claro', corPrimaria: '#FFFFFF', corDestaque: '#D6336C' }
  ];

  window.EstokioMarca = { PADRAO, COMBINACOES, hexOk, variaveis, aplicar, limpar, iniciais, processarLogo, tintaSobre };
})();
