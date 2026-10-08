// Marca de versão no rodapé do menu, só para conferir se o navegador está com os arquivos novos.
// Arquivo externo (em vez de <script> inline) para o Content-Security-Policy poder ficar sem 'unsafe-inline' em script-src.
(function () {
  var t = document.getElementById('build-tag');
  if (t) t.textContent = '· versão 2026-10-07.1';
})();
