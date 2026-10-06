/*
 * Estokio — códigos de barras em SVG, sem bibliotecas externas.
 * EAN-13 (produtos com código de barras válido) e Code 128 (qualquer outro código).
 */
(function () {
  'use strict';

  /* ---------------- EAN-13 ---------------- */
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
  const PARIDADE = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

  function digitoEAN(doze) {
    let s = 0;
    for (let i = 0; i < 12; i++) s += Number(doze[i]) * (i % 2 ? 3 : 1);
    return String((10 - (s % 10)) % 10);
  }
  /** Aceita EAN-13 válido, ou EAN-12/UPC-A (completa o dígito ou o zero à esquerda). */
  function normalizarEAN(c) {
    const d = String(c || '').replace(/\D/g, '');
    if (d.length === 13) return digitoEAN(d.slice(0, 12)) === d[12] ? d : null;
    if (d.length === 12) return digitoEAN('0' + d.slice(0, 11)) === d[11] ? '0' + d : null; // UPC-A
    return null;
  }
  function bitsEAN(ean) {
    const p = PARIDADE[Number(ean[0])];
    let b = '101';
    for (let i = 1; i <= 6; i++) b += (p[i - 1] === 'L' ? L : G)[Number(ean[i])];
    b += '01010';
    for (let i = 7; i <= 12; i++) b += R[Number(ean[i])];
    return b + '101';
  }

  /* ---------------- Code 128 (conjunto B, com otimização para números no conjunto C) ---------------- */
  const P128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
  const START_B = 104, START_C = 105, CODE_B = 100, CODE_C = 99, STOP = 106;

  function valores128(texto) {
    const t = String(texto).replace(/[^\x20-\x7E]/g, '');
    const vals = [];
    if (/^\d+$/.test(t) && t.length >= 4) {
      // Números: conjunto C (dois dígitos por símbolo). Se sobrar um dígito, troca para o B só no fim.
      vals.push(START_C);
      const par = t.length % 2 === 0 ? t : t.slice(0, -1);
      for (let i = 0; i < par.length; i += 2) vals.push(Number(par.slice(i, i + 2)));
      if (par.length < t.length) vals.push(CODE_B, t.charCodeAt(t.length - 1) - 32);
    } else {
      vals.push(START_B);
      for (const ch of t) vals.push(ch.charCodeAt(0) - 32);
    }
    let soma = vals[0];
    for (let i = 1; i < vals.length; i++) soma += vals[i] * i;
    vals.push(soma % 103, STOP);
    return vals;
  }
  function bits128(texto) {
    let b = '';
    for (const v of valores128(texto)) {
      const w = P128[v];
      for (let i = 0; i < w.length; i++) b += (i % 2 ? '0' : '1').repeat(Number(w[i]));
    }
    return b;
  }

  /* ---------------- SVG ---------------- */
  function svg(bits, { altura = 50, modulo = 2, texto = '', esticar = false } = {}) {
    const margem = 11 * modulo; // zona de silêncio exigida pela norma
    const larg = bits.length * modulo + margem * 2;
    let rects = '';
    for (let i = 0; i < bits.length;) {
      if (bits[i] === '1') {
        let j = i; while (j < bits.length && bits[j] === '1') j++;
        rects += `<rect x="${margem + i * modulo}" y="0" width="${(j - i) * modulo}" height="${altura}"/>`;
        i = j;
      } else i++;
    }
    const alt = altura + (texto ? 14 : 0);
    const legenda = texto ? `<text x="${larg / 2}" y="${altura + 12}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12">${texto.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${larg} ${alt}" preserveAspectRatio="${esticar ? 'none' : 'xMidYMid meet'}" shape-rendering="crispEdges"><rect width="${larg}" height="${alt}" fill="#fff"/><g fill="#000">${rects}</g>${legenda}</svg>`;
  }

  /** Escolhe o formato: EAN-13 quando o código é um EAN válido, senão Code 128. */
  function codigoBarras(codigo, opcoes = {}) {
    const ean = normalizarEAN(codigo);
    if (ean) return { tipo: 'EAN-13', texto: ean, svg: svg(bitsEAN(ean), { ...opcoes, texto: opcoes.legenda === false ? '' : ean }) };
    const t = String(codigo || '').trim();
    if (!t) return null;
    return { tipo: 'Code 128', texto: t, svg: svg(bits128(t), { ...opcoes, texto: opcoes.legenda === false ? '' : t }) };
  }

  window.EstokioCodigos = { codigoBarras, normalizarEAN, digitoEAN, bitsEAN, bits128, P128, L, G, R };
})();
