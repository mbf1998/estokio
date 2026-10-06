/*
 * Estokio — leitura de código de barras pela câmera.
 * Usa o leitor nativo do navegador (BarcodeDetector) quando existe (Android, Chrome no Mac)
 * e, nos outros casos (Windows, Electron, iPhone), a biblioteca ZXing carregada sob demanda.
 */
(function () {
  'use strict';

  const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
  const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'];

  function carregarZXing() {
    if (window.ZXing) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = ZXING_URL;
      s.onload = () => (window.ZXing ? res() : rej(new Error('O leitor não carregou.')));
      s.onerror = () => rej(new Error('Para usar a câmera como leitor é preciso internet na primeira vez. Digite o código no campo abaixo.'));
      document.head.appendChild(s);
    });
  }

  function mensagemErro(e) {
    const n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'A permissão para usar a câmera foi negada. Libere a câmera nas configurações do navegador ou do aparelho.';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'Nenhuma câmera encontrada neste aparelho.';
    if (n === 'NotReadableError') return 'A câmera está sendo usada por outro programa.';
    return (e && e.message) || 'Não foi possível abrir a câmera.';
  }

  /**
   * Abre a câmera no <video> e chama aoLer(codigo) a cada leitura.
   * Devolve uma função que para a câmera.
   */
  async function iniciar(video, aoLer) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Este navegador não permite usar a câmera aqui. Digite o código no campo abaixo.');
    }
    let parado = false, stream = null, leitor = null, ultimo = '', ultimoEm = 0;
    const emitir = (codigo) => {
      codigo = String(codigo || '').trim();
      if (!codigo || parado) return;
      const agora = Date.now();
      if (codigo === ultimo && agora - ultimoEm < 2000) return; // evita ler o mesmo código várias vezes seguidas
      ultimo = codigo; ultimoEm = agora;
      if (navigator.vibrate) navigator.vibrate(60);
      aoLer(codigo);
    };
    const parar = () => {
      parado = true;
      try { if (leitor) leitor.reset(); } catch (e) { /* ignora */ }
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (video.srcObject && video.srcObject.getTracks) video.srcObject.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
    const restricoes = { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
    video.setAttribute('playsinline', '');
    video.muted = true;

    try {
      let formatos = [];
      if ('BarcodeDetector' in window) {
        try { formatos = (await window.BarcodeDetector.getSupportedFormats()).filter((f) => FORMATOS.includes(f)); } catch (e) { formatos = []; }
      }
      if (formatos.length) {
        stream = await navigator.mediaDevices.getUserMedia(restricoes);
        if (parado) { parar(); return parar; }
        video.srcObject = stream;
        await video.play();
        const detector = new window.BarcodeDetector({ formats: formatos });
        const ciclo = async () => {
          if (parado) return;
          try { const r = await detector.detect(video); if (r.length) emitir(r[0].rawValue); } catch (e) { /* quadro sem imagem */ }
          if (!parado) setTimeout(ciclo, 150);
        };
        ciclo();
      } else {
        await carregarZXing();
        if (parado) return parar;
        leitor = new window.ZXing.BrowserMultiFormatReader();
        await leitor.decodeFromConstraints(restricoes, video, (res) => { if (res) emitir(res.getText()); });
      }
    } catch (e) {
      parar();
      throw new Error(mensagemErro(e));
    }
    return parar;
  }

  window.EstokioScanner = { iniciar };
})();
