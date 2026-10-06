/*
 * Estokio — configuração do Firebase
 *
 * 1. No console do Firebase (https://console.firebase.google.com), abra seu projeto.
 * 2. Engrenagem > Configurações do projeto > Seus apps > App da Web (</>).
 * 3. Copie os valores de "firebaseConfig" e cole abaixo.
 *
 * Enquanto apiKey e projectId estiverem vazios, o Estokio roda em
 * MODO DEMONSTRAÇÃO: os dados ficam salvos só neste navegador/computador.
 */
window.ESTOKIO_FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

/*
 * Tela inicial de quem abre o gestor (/app/) sem estar logado:
 *   'site'  = página de apresentação na raiz do domínio, com o sistema ao vivo (padrão)
 *   'demo'  = direto na demonstração com a loja fictícia
 *   'login' = tela de login
 * No app Android a tela inicial é sempre o login.
 */
window.ESTOKIO_TELA_INICIAL = 'site';
