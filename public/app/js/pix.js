/*
 * Estokio — Pix "copia e cola" e QR Code no padrão do Banco Central (BR Code estático).
 * O código é gerado no próprio aparelho: não precisa de banco, provedor nem servidor.
 * O QR Code usa a biblioteca qrcode-generator, carregada da internet na primeira vez.
 */
(function () {
  'use strict';


  const campo = (id, valor) => { const v = String(valor); return id + String(v.length).padStart(2, '0') + v; };

  /** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), exigido no campo 63 do BR Code. */
  function crc16(texto) {
    let crc = 0xFFFF;
    for (let i = 0; i < texto.length; i++) {
      crc ^= texto.charCodeAt(i) << 8;
      for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  /** Nome e cidade: sem acento, maiúsculas, só letras, números e espaço. */
  const limpar = (s, max) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

  /** Formata a chave conforme o tipo cadastrado pelo admin. */
  function normalizarChave(chave, tipo) {
    const c = String(chave || '').trim();
    const d = c.replace(/\D/g, '');
    if (tipo === 'celular') return '+55' + d.replace(/^55(?=\d{10,11}$)/, '');
    if (tipo === 'cpfcnpj') return d;
    if (tipo === 'email') return c.toLowerCase();
    return c; // chave aleatória
  }

  /**
   * Monta o texto do Pix copia e cola.
   * { chave, tipoChave, nome, cidade, valor, txid }
   */
  function payload({ chave, tipoChave, nome, cidade, valor, txid }) {
    const k = normalizarChave(chave, tipoChave);
    if (!k) throw new Error('Chave Pix não configurada.');
    const conta = campo('00', 'br.gov.bcb.pix') + campo('01', k);
    const id = String(txid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
    let p = campo('00', '01')
      + campo('26', conta)
      + campo('52', '0000')
      + campo('53', '986')
      + (valor > 0 ? campo('54', Number(valor).toFixed(2)) : '')
      + campo('58', 'BR')
      + campo('59', limpar(nome, 25) || 'RECEBEDOR')
      + campo('60', limpar(cidade, 15) || 'BRASIL')
      + campo('62', campo('05', id));
    p += '6304';
    return p + crc16(p);
  }

  // qrcode-generator (kazuhikoarase): robusto para textos longos como o Pix. Duas fontes, por segurança.
  const QR_URLS = [
    'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js'
  ];
  function carregarScript(url) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => (typeof window.qrcode === 'function' ? res() : rej(new Error('QR indisponível')));
      s.onerror = () => { s.remove(); rej(new Error('falhou')); };
      document.head.appendChild(s);
    });
  }
  async function carregarQR() {
    if (typeof window.qrcode === 'function') return;
    for (const url of QR_URLS) {
      try { await carregarScript(url); return; } catch (e) { /* tenta a próxima */ }
    }
    throw new Error('Sem internet para gerar o QR Code. Use o Pix copia e cola.');
  }

  /** Desenha o QR Code do texto dentro do elemento (SVG nítido em qualquer tela). */
  async function desenharQR(el, texto, tamanho = 220) {
    await carregarQR();
    const qr = window.qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    const n = qr.getModuleCount() + 8; // 4 módulos de margem de cada lado
    const cel = Math.max(2, Math.floor(tamanho / n));
    el.innerHTML = qr.createSvgTag({ cellSize: cel, margin: cel * 4, scalable: true });
    const svg = el.querySelector('svg');
    if (svg) { svg.setAttribute('width', tamanho); svg.setAttribute('height', tamanho); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'QR Code do Pix'); }
  }

  const ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function novoTxid() {
    const b = new Uint8Array(10); crypto.getRandomValues(b);
    return 'EST' + Array.from(b, (x) => ALFA[x % ALFA.length]).join('');
  }

  window.EstokioPix = { payload, crc16, desenharQR, novoTxid, normalizarChave };
})();
