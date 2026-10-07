/*
 * Estokio — interface (multiempresa)
 * Depende de window.EstokioDB (js/db.js) e window.EstokioMarca (js/marca.js).
 *
 * Fluxo de sessão:
 *   sem login ............................ tela de acesso
 *   logado, sem empresa .................. tela "Ative seu acesso" (código EST ou EQP)
 *   responsável, empresa não configurada . tela "Configure sua empresa"
 *   empresa suspensa ..................... aviso
 *   acesso vencido ....................... responsável digita código de renovação (REN)
 *   tudo certo ........................... aplicativo, com as cores e o logo da empresa
 */
(function () {
  'use strict';

  const DB = window.EstokioDB;
  const Marca = window.EstokioMarca;
  const Imp = window.EstokioImport;
  const Scanner = window.EstokioScanner;
  const Prev = window.EstokioPrevisao;
  const Ass = window.EstokioAssinatura;
  const Cod = window.EstokioCodigos;
  const Pix = window.EstokioPix;

  /* ================= utilitários ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
  const cf = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  /** Campos dentro de um objeto aninhado (como pedidoExclusao) não passam pela conversão de toPlain(): aceita Timestamp do Firestore, Date ou número. */
  const msDe = (v) => (v && typeof v.toDate === 'function' ? v.toDate().getTime() : v instanceof Date ? v.getTime() : num(v));
  const df = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const dfd = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
  const TERMOS_VERSAO = '2.0'; // precisa bater com a "Versão" escrita no topo de public/termos.html
  const hf = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const logoSeguro = (u) => (typeof u === 'string' && /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/.test(u) ? u : '');

  const ICONS = {
    painel: '<path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"/>',
    produtos: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
    movimentacoes: '<path d="M7 20V5M3 9l4-4 4 4M17 4v15M13 15l4 4 4-4"/>',
    categorias: '<path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    equipe: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.9.3 5 2.7 5 5.8"/>',
    empresa: '<path d="M4 21V5l8-2v18M12 8l8 2v11M3 21h18M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    entrada: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    saida: '<path d="M12 15V4M7 9l5-5 5 5M5 20h14"/>',
    ajuste: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    excluir: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    exportar: '<path d="M14 3H6v18h12V7zM14 3v4h4M12 11v6M9 14l3 3 3-3"/>',
    sair: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
    busca: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
    fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
    copiar: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V4H4v12h4"/>',
    mensagem: '<path d="M4 5h16v11H9l-5 4z"/>',
    imagem: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
    codigo: '<path d="M3 7V4h3M18 4h3v3M21 17v3h-3M6 20H3v-3M7 8v8M10 8v8M13 8v8M17 8v8"/>',
    importar: '<path d="M12 15V4M7 9l5-5 5 5M4 15v5h16v-5"/>',
    compras: '<path d="M3 4h2l2.4 11h11L21 7H6.2"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
    fornecedores: '<path d="M2 6h11v10H2zM13 10h4l3 3v3h-7"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
    ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    cadeado: '<rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    pix: '<path d="M12 3.5 20.5 12 12 20.5 3.5 12z"/><path d="M8.5 12h7"/>',
    whatsapp: '<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z"/>',
    gerar: '<path d="M4 4v6h6"/><path d="M20 20v-6h-6"/><path d="M4.5 15a8 8 0 0 0 14.1 3.4M19.5 9A8 8 0 0 0 5.4 5.6"/>'
  };
  const icon = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;

  const UNIDADES = ['un', 'cx', 'pct', 'kg', 'g', 'L', 'mL', 'm', 'par'];
  const TIPOS = { entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste', transferencia: 'Transferência' };
  const ROUTES = {
    painel: { titulo: 'Painel' },
    produtos: { titulo: 'Produtos' },
    movimentacoes: { titulo: 'Movimentações' },
    compras: { titulo: 'Lista de compras', recurso: 'compras', perm: 'estoque' },
    fornecedores: { titulo: 'Fornecedores', perm: 'estoque' },
    categorias: { titulo: 'Categorias', perm: 'estoque' },
    importar: { titulo: 'Importar', recurso: 'importar', perm: 'gerir' },
    equipe: { titulo: 'Equipe', dono: true },
    empresa: { titulo: 'Empresa', dono: true }
  };

  /* ---------- menu em grupos: cinco itens no menu e abas dentro de cada grupo ---------- */
  const GRUPOS = [
    { id: 'painel', nome: 'Painel', rotas: ['painel', 'relatorios'] },
    { id: 'produtos', nome: 'Produtos', rotas: ['produtos', 'categorias', 'grades', 'etiquetas', 'importar'] },
    { id: 'estoque', nome: 'Estoque', rotas: ['movimentacoes', 'validades', 'inventario', 'locais'] },
    { id: 'compras', nome: 'Compras', rotas: ['compras', 'pedidos-compra', 'fornecedores'] },
    { id: 'empresa', nome: 'Empresa', rotas: ['empresa', 'equipe'] }
  ];
  const NOME_ABA = {
    painel: 'Painel', relatorios: 'Relatórios', produtos: 'Produtos', categorias: 'Categorias', grades: 'Grades', etiquetas: 'Etiquetas', importar: 'Importar',
    movimentacoes: 'Movimentações', validades: 'Validades', inventario: 'Inventário', locais: 'Locais',
    compras: 'Lista de compras', 'pedidos-compra': 'Pedidos de compra', fornecedores: 'Fornecedores', empresa: 'Empresa', equipe: 'Equipe'
  };
  const grupoDaRota = (r) => GRUPOS.find((g) => g.rotas.includes(r));

  const ERROS = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/invalid-login-credentials': 'E-mail ou senha incorretos.',
    'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Use a aba Entrar; depois do login você digita o código.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/invalid-email': 'Esse e-mail não é válido.',
    'auth/missing-email': 'Informe seu e-mail.',
    'auth/too-many-requests': 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com a internet. Verifique a rede e tente de novo.',
    'permission-denied': 'Você não tem permissão para essa operação.',
    'unavailable': 'Sem conexão com o servidor. Essa operação precisa de internet.',
    'failed-precondition': 'O banco de dados recusou a operação. Veja o console do navegador para detalhes.'
  };
  const msgErro = (e) => ERROS[e && e.code] || (e && e.message) || 'Algo deu errado.';

  /* ================= estado ================= */
  const state = {
    user: null, perfil: null, empresa: null, tela: null,
    produtos: [], movs: [], cats: [], membros: [], convites: [], fornecedores: [], notas: [], locais: [], grades: [],
    solicitacoes: [], pedidosCompra: [], inventarios: [], meuPapel: null, regrasAntigas: false, aceiteInfo: undefined,
    compra: carregarPrefCompra(),
    imp: { aba: 'planilha', registros: null, arquivo: '', reconhecidas: [], ignoradas: [], atualizar: true, ajustarQtd: false, analise: null, nfe: null, ocupado: false },
    pararScanner: null,
    planos: [], config: {}, pedidos: [], esc: null, loadedCatalogo: false, pedidosOn: false,
    loaded: {},
    route: 'painel',
    f: { q: '', cat: '', nivel: '', mq: '', tipo: '', de: '', ate: '' },
    unsubSessao: [], unsubDados: [],
    codigoPendente: null, nomePendente: null
  };

  function carregarPrefCompra() {
    const padrao = { incluirDias: 14, cobertura: 30, ajustes: {} };
    try { return { ...padrao, ...JSON.parse(localStorage.getItem('estokio:compras') || '{}'), ajustes: {} }; } catch (e) { return padrao; }
  }
  function salvarPrefCompra() {
    try { localStorage.setItem('estokio:compras', JSON.stringify({ incluirDias: state.compra.incluirDias, cobertura: state.compra.cobertura })); } catch (e) { /* sem armazenamento */ }
  }

  /** Recursos liberados pelo plano da empresa. Sem plano definido, tudo liberado. */
  const recurso = (k) => {
    const r = state.empresa && state.empresa.recursos;
    if (k === 'importar') return !r || r.importacao !== false || r.nfe !== false;
    if (k === 'importacao') return !r || r.importacao !== false;
    // Lotes, grade, multiloja, relatórios, etiquetas e integração só valem quando o plano os traz (o teste grátis libera tudo)
    if (Ass.EXIGE_CONTRATO.includes(k)) return Boolean(r && r[k] === true) || Boolean(state.empresa && state.empresa.planoId === 'teste');
    return !r || r[k] !== false;
  };

  /* ---------- módulos de recursos (js/modulos/*.js) ---------- */
  let MODULOS = [];
  const ACOES_MOD = {};
  /** Junta o HTML devolvido por um gancho de todos os módulos. */
  function hook(nome, ...args) {
    return MODULOS.map((m) => (m.hooks && m.hooks[nome] ? m.hooks[nome](...args) || '' : '')).join('');
  }
  /** Executa um gancho que altera dados (pode lançar erro de validação). */
  function hookDados(nome, ...args) {
    for (const m of MODULOS) if (m.hooks && m.hooks[nome]) m.hooks[nome](...args);
  }
  const limiteProdutos = () => num(state.empresa && state.empresa.maxProdutos);
  const botaoLer = () => (recurso('leitor') ? `<button class="btn" data-action="escanear">${icon('codigo')}Ler código</button>` : '');

  const ehDono = () => Boolean(state.empresa && state.user && state.empresa.donoUid === state.user.uid);

  /* ---------- papéis: o que cada pessoa da equipe pode fazer (as regras do Firestore garantem o mesmo) ---------- */
  const PAPEIS = { dono: 'Responsável', gerente: 'Gerente', estoquista: 'Estoquista', caixa: 'Caixa' };
  const PAPEIS_DESC = {
    gerente: 'Tudo, menos plano, equipe e dados da empresa. Vê custos e aprova ajustes.',
    estoquista: 'Entradas, saídas, cadastro de produtos, pedidos e contagens. Ajustes vão para aprovação. Não vê custos.',
    caixa: 'Só registra saídas e consulta o estoque. Não vê custos.'
  };
  const PODE = { verCusto: ['dono', 'gerente'], gerir: ['dono', 'gerente'], estoque: ['dono', 'gerente', 'estoquista'] };
  const normPapel = (p) => (!p || p === 'membro' ? 'estoquista' : p);
  function meuPapel() {
    if (ehDono() || DB.mode === 'local') return 'dono';
    const m = state.user && state.membros.find((x) => x.id === state.user.uid);
    return normPapel((m && m.papel) || state.meuPapel || (state.perfil && state.perfil.papel));
  }
  /** pode('saida') é de todos; 'estoque', 'gerir' e 'verCusto' dependem do papel. */
  const pode = (acao) => acao === 'saida' || (PODE[acao] || []).includes(meuPapel());

  /* ---------- kits ---------- */
  const ehKit = (p) => Boolean(p && Array.isArray(p.kit) && p.kit.length);
  /** Quantos kits dá para montar com o estoque atual dos itens. */
  function kitDisponivel(p) {
    if (!ehKit(p)) return num(p.quantidade);
    let m = Infinity;
    for (const i of p.kit) {
      const c = state.produtos.find((x) => x.id === i.produtoId);
      if (!c || num(i.qtd) <= 0) return 0;
      m = Math.min(m, Math.floor(num(c.quantidade) / num(i.qtd)));
    }
    return m === Infinity ? 0 : m;
  }
  const custoKit = (p) => (p.kit || []).reduce((s, i) => { const c = state.produtos.find((x) => x.id === i.produtoId); return s + (c ? num(c.custo) * num(i.qtd) : 0); }, 0);
  const itensKitTxt = (p) => (p.kit || []).map((i) => { const c = state.produtos.find((x) => x.id === i.produtoId); return `${nf.format(num(i.qtd))} ${c ? c.nome : 'item removido'}`; }).join(', ');
  const maxUsuarios = () => num(state.empresa && state.empresa.maxUsuarios) || DB.MAX_USUARIOS;
  const catName = (id) => (state.cats.find((c) => c.id === id) || {}).nome || '';
  const fornById = (id) => state.fornecedores.find((f) => f.id === id);
  const sortedForn = () => state.fornecedores.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  const semZeros = (s) => String(s || '').trim().replace(/^0+/, '');

  /* ---------- gerar SKU e código de barras no cadastro do produto ---------- */
  /** 3 letras do nome do produto (sem acento) + 4 números, sem repetir um SKU já usado. */
  function gerarSku(nome, ignorarId) {
    const letras = String(nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().match(/[A-Z0-9]/g);
    const base = (letras || []).slice(0, 3).join('') || 'PRD';
    const usados = new Set(state.produtos.filter((x) => x.id !== ignorarId && x.sku).map((x) => norm(x.sku)));
    let tentativa, i = 0;
    do { tentativa = `${base}-${String(Math.floor(1000 + Math.random() * 9000))}`; i++; }
    while (usados.has(norm(tentativa)) && i < 50);
    return tentativa;
  }
  /** EAN-13 válido, na faixa 20–29 reservada pelo GS1 para uso interno (nunca atribuída a um produto de verdade). */
  function gerarEan(ignorarId) {
    const usados = new Set(state.produtos.filter((x) => x.id !== ignorarId && x.codigoBarras).map((x) => semZeros(x.codigoBarras)));
    let tentativa, i = 0;
    do {
      let doze = String(20 + Math.floor(Math.random() * 10)).slice(0, 2);
      for (let k = 0; k < 10; k++) doze += Math.floor(Math.random() * 10);
      tentativa = doze + Cod.digitoEAN(doze);
      i++;
    } while (usados.has(semZeros(tentativa)) && i < 50);
    return tentativa;
  }
  /** Acha produto pelo código de barras (EAN/UPC, ignorando zeros à esquerda) ou pelo código interno. */
  function prodPorCodigo(codigo) {
    const c = String(codigo || '').trim();
    if (!c) return null;
    return state.produtos.find((p) => p.codigoBarras && semZeros(p.codigoBarras) === semZeros(c))
      || state.produtos.find((p) => p.sku && norm(p.sku) === norm(c)) || null;
  }
  const digitos = (s) => String(s || '').replace(/\D/g, '');
  function fmtFone(t) {
    const d = digitos(t).replace(/^55(?=\d{10,11}$)/, '');
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return t || '';
  }
  function fmtCnpj(c) {
    const d = digitos(c);
    if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return c || '';
  }
  const waNumero = (t) => { const d = digitos(t); return d.length === 10 || d.length === 11 ? '55' + d : d; };
  const touch = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const prodById = (id) => state.produtos.find((p) => p.id === id);
  const sortedCats = () => state.cats.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const sortedProds = () => state.produtos.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  const vencido = (emp) => Boolean(emp && emp.acessoAte && emp.acessoAte <= Date.now());
  const diasRestantes = (emp) => (emp && emp.acessoAte ? Math.ceil((emp.acessoAte - Date.now()) / DB.DIA) : null);
  const convitesValidos = () => state.convites.filter((c) => c.status === 'pendente' && (!c.validoAte || c.validoAte > Date.now()));

  function nivel(p) {
    const q = ehKit(p) ? kitDisponivel(p) : num(p.quantidade), min = num(p.estoqueMinimo);
    if (q <= 0) return 'zerado';
    if (min > 0 && q <= min) return 'baixo';
    return 'ok';
  }
  const NIVEL_TXT = { zerado: 'Sem estoque', baixo: 'Abaixo do mínimo', ok: 'Normal' };

  let cacheConsumo = { movs: null, mapa: new Map() };
  function consumoMapa() {
    if (cacheConsumo.movs !== state.movs) cacheConsumo = { movs: state.movs, mapa: Prev.consumos(state.movs) };
    return cacheConsumo.mapa;
  }
  const mediaDia = (p) => (consumoMapa().get(p.id) || {}).mediaDia || 0;
  const acabaEm = (p) => Prev.diasAteAcabar(p, mediaDia(p));
  const ALERTA_DIAS = 7;
  const acabaLogo = (p) => { if (ehKit(p)) return false; const d = acabaEm(p); return d !== null && d <= ALERTA_DIAS && num(p.quantidade) > 0; };
  /* ---------- prazo de entrega dos fornecedores e hora de pedir ---------- */
  let cachePrazos = { pedidos: null, forn: null, mapa: new Map() };
  /** Prazo do fornecedor: média real das últimas entregas ou, sem elas, o prazo informado no cadastro. */
  function prazoDe(fornecedorId) {
    if (cachePrazos.pedidos !== state.pedidosCompra || cachePrazos.forn !== state.fornecedores) cachePrazos = { pedidos: state.pedidosCompra, forn: state.fornecedores, mapa: new Map() };
    if (!fornecedorId) return Prev.prazoFornecedor(null, []);
    if (!cachePrazos.mapa.has(fornecedorId)) cachePrazos.mapa.set(fornecedorId, Prev.prazoFornecedor(fornById(fornecedorId), state.pedidosCompra));
    return cachePrazos.mapa.get(fornecedorId);
  }
  let cacheCaminho = { pedidos: null, mapa: new Map() };
  /** Quanto de cada produto está em pedidos de compra ainda não recebidos. */
  function caminhoMapa() {
    if (cacheCaminho.pedidos !== state.pedidosCompra) {
      const mapa = new Map();
      for (const pc of state.pedidosCompra) {
        if (pc.status !== 'aberto' && pc.status !== 'parcial') continue;
        for (const i of pc.itens || []) mapa.set(i.produtoId, (mapa.get(i.produtoId) || 0) + Math.max(0, num(i.qtd) - num(i.recebido)));
      }
      cacheCaminho = { pedidos: state.pedidosCompra, mapa };
    }
    return cacheCaminho.mapa;
  }
  const aCaminho = (pid) => caminhoMapa().get(pid) || 0;
  let cacheAval = { refs: [], mapa: new Map() };
  /** Motivos para pedir uma nova remessa (abaixo do mínimo, vai faltar antes da entrega, lote vencendo) e se já está coberto por um pedido a caminho. */
  function avaliar(p) {
    if (ehKit(p)) return { motivos: [], urgente: false, coberto: false, pedir: false };
    const refs = [state.produtos, state.movs, state.pedidosCompra, state.fornecedores];
    if (refs.some((r, i) => r !== cacheAval.refs[i])) cacheAval = { refs, mapa: new Map() };
    const c = cacheAval.mapa.get(p.id);
    if (c && c.p === p) return c.a;
    const a = Prev.avaliarReposicao(p, { mediaDia: mediaDia(p), prazo: prazoDe(p.fornecedorId).dias, caminho: aCaminho(p.id), nivel: nivel(p) });
    cacheAval.mapa.set(p.id, { p, a });
    return a;
  }
  // Kits não se compram: quem pede reposição são os itens deles
  const precisaRepor = (p) => !ehKit(p) && (nivel(p) !== 'ok' || acabaLogo(p) || avaliar(p).pedir);
  /** Produtos que pedem uma remessa agora (sem os já cobertos por pedido a caminho), os mais urgentes primeiro. */
  function produtosParaPedir() {
    const chave = (p) => (nivel(p) === 'zerado' ? -1 : acabaEm(p) ?? 1e6 + num(p.quantidade) / Math.max(1, num(p.estoqueMinimo)));
    return state.produtos.filter((p) => avaliar(p).pedir)
      .sort((a, b) => (avaliar(b).urgente - avaliar(a).urgente) || (chave(a) - chave(b)) || a.nome.localeCompare(b.nome, 'pt-BR'));
  }
  const textoPrazo = (pz) => (pz.dias === null ? '' : `${plural(pz.dias, 'dia', 'dias')}`);
  function atualizarBadgeCompras() {
    const marcas = $$('#badge-compras, .aba-badge');
    if (!marcas.length || !state.loaded.produtos) return;
    const lista = produtosParaPedir();
    const urgente = lista.some((p) => avaliar(p).urgente);
    marcas.forEach((b) => {
      b.hidden = !lista.length || !pode('estoque');
      b.textContent = lista.length;
      b.classList.toggle('is-urgente', urgente);
      b.title = `${plural(lista.length, 'produto', 'produtos')} para pedir`;
    });
  }
  const txtDias = (d) => (d < 1 ? 'menos de 1 dia' : `cerca de ${plural(Math.round(d), 'dia', 'dias')}`);
  const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

  function gauge(p) {
    const q = Math.max(0, num(p.quantidade)), min = num(p.estoqueMinimo);
    const cap = Math.max(min * 2, q, 1);
    const pct = Math.min(100, (q / cap) * 100);
    const minMark = min > 0 ? `<span class="gauge-min" style="left:${((min / cap) * 100).toFixed(1)}%"></span>` : '';
    return `<span class="gauge ${nivel(p)}" role="img" aria-label="${NIVEL_TXT[nivel(p)]}"><span class="gauge-fill" style="width:${pct.toFixed(1)}%"></span>${minMark}</span>`;
  }

  function quando(ms) {
    if (!ms) return '';
    const d = Date.now() - ms;
    if (d < 60e3) return 'agora';
    if (d < 3600e3) return `há ${Math.floor(d / 60e3)} min`;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    if (ms >= hoje.getTime()) return `hoje, ${hf.format(ms)}`;
    if (ms >= hoje.getTime() - 864e5) return `ontem, ${hf.format(ms)}`;
    return df.format(ms);
  }

  const qtdSinal = (m) => {
    if (m.tipo === 'transferencia') return `⇄ ${nf.format(m.quantidade)}`;
    if (m.tipo === 'entrada') return `+${nf.format(m.quantidade)}`;
    if (m.tipo === 'saida') return `−${nf.format(m.quantidade)}`;
    const dif = num(m.depois) - num(m.antes);
    return `${dif >= 0 ? '+' : '−'}${nf.format(Math.abs(dif))}`;
  };

  function urlApp() {
    if (/^https?:$/.test(location.protocol)) return location.origin + location.pathname.replace(/index\.html$/, '');
    return DB.projectId ? `https://${DB.projectId}.web.app` : '';
  }

  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); toast('Copiado.'); }
    catch (e) {
      const t = Object.assign(document.createElement('textarea'), { value: texto });
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); toast('Copiado.'); } catch (x) { toast('Não foi possível copiar. Selecione o texto e copie manualmente.', 'erro'); }
      t.remove();
    }
  }

  /* ================= toasts e modal ================= */
  function toast(msg, tipo = 'ok') {
    const el = document.createElement('div');
    el.className = `toast toast-${tipo}`;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 250); }, 3400);
  }

  let lastFocus = null;
  function pararLeitor() {
    if (state.pararScanner) { try { state.pararScanner(); } catch (e) { /* ignora */ } state.pararScanner = null; }
  }

  function openModal(html, { wide = false, semFoco = false } = {}) {
    pararLeitor();
    lastFocus = document.activeElement;
    $('#modal-root').innerHTML = `<div class="backdrop"><div class="modal${wide ? ' modal-wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
    const modal = $('#modal-root .modal');
    const alvo = semFoco ? modal.querySelector('.icon-btn') : (modal.querySelector('[autofocus]') || modal.querySelector('input:not([type=hidden]):not([type=radio]), select, textarea, button'));
    if (alvo) setTimeout(() => alvo.focus(), 20);
    return modal;
  }
  function closeModal() {
    pararLeitor();
    if (!$('#modal-root').innerHTML) return;
    $('#modal-root').innerHTML = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $('#modal-root').addEventListener('mousedown', (e) => { if (e.target.classList.contains('backdrop')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  const modalHead = (titulo) => `<header class="modal-head"><h2>${titulo}</h2><button type="button" class="icon-btn" data-action="close-modal" aria-label="Fechar">${icon('fechar')}</button></header>`;

  function confirmar(titulo, texto, ok = 'Excluir') {
    return new Promise((resolve) => {
      const m = openModal(`${modalHead(titulo)}
        <div class="modal-body"><p class="confirm-text">${texto}</p></div>
        <footer class="modal-foot"><button type="button" class="btn" data-r="0">Cancelar</button><button type="button" class="btn btn-danger" data-r="1" autofocus>${ok}</button></footer>`);
      m.addEventListener('click', (e) => {
        const b = e.target.closest('[data-r],[data-action="close-modal"]');
        if (!b) return;
        e.stopPropagation();
        closeModal(); resolve(b.dataset.r === '1');
      });
    });
  }

  function setBusy(btn, busy, texto) {
    if (!btn) return;
    if (busy) { btn.dataset.txt = btn.innerHTML; btn.disabled = true; btn.textContent = texto || 'Salvando…'; }
    else { btn.disabled = false; if (btn.dataset.txt) btn.innerHTML = btn.dataset.txt; }
  }
  function showFormError(form, msg) {
    const p = form.querySelector('.form-error');
    if (!p) return toast(msg, 'erro');
    p.textContent = msg; p.hidden = !msg;
  }

  /* ================= telas ================= */
  function mostrar(qual) {
    $('#auth').hidden = qual !== 'auth';
    $('#tela').hidden = qual !== 'tela';
    $('#shell').hidden = qual !== 'shell';
    if (qual !== 'tela') $('#tela').innerHTML = '';
    if (qual !== 'shell') { $('#view').innerHTML = ''; $('#page-actions').innerHTML = ''; }
    window.scrollTo(0, 0);
  }

  const marcaEstokio = `<div class="gate-brand"><img class="logo-estokio" src="assets/estokio-logo.svg" alt="Estokio"></div>`;

  function telaCarregando() {
    state.tela = 'carregando';
    mostrar('tela');
    $('#tela').innerHTML = `<div class="gate"><div class="gate-card gate-center">${marcaEstokio}<p class="muted">Carregando sua empresa…</p></div></div>`;
  }

  function telaMensagem(titulo, texto) {
    state.tela = 'mensagem';
    closeModal();
    mostrar('tela');
    $('#tela').innerHTML = `
      <div class="gate"><div class="gate-card">
        ${marcaEstokio}
        <h1>${titulo}</h1>
        <p>${texto}</p>
        <button class="btn btn-block" data-action="logout">Sair</button>
      </div></div>`;
  }

  /* ---------- ativar código ---------- */
  function telaAtivar() {
    state.tela = 'ativar';
    mostrar('tela');
    const comCodigo = Boolean(state.codigoPendente);
    $('#tela').innerHTML = `
      <div class="gate"><div class="gate-card gate-wide">
        ${marcaEstokio}
        <h1>Vamos começar</h1>
        <p>Você entrou como <strong>${esc(state.user.email)}</strong>. Comece um teste grátis ou use o código que você recebeu.</p>
        <div class="tabs inicio-tabs" role="tablist">
          <button role="tab" data-inicio="teste" aria-selected="${!comCodigo}">Teste grátis de 7 dias</button>
          <button role="tab" data-inicio="codigo" aria-selected="${comCodigo}">Tenho um código de convite</button>
        </div>
        <div id="inicio-area"></div>
        <button class="link-btn gate-out" data-action="logout">Sair e usar outra conta</button>
      </div></div>`;
    const area = $('#inicio-area');
    const abrir = (qual) => {
      $$('[data-inicio]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.inicio === qual)));
      if (qual === 'teste') return formTeste(area);
      area.innerHTML = '<div id="ativar-area"></div>';
      formCodigo(state.codigoPendente || '');
      if (state.codigoPendente) $('#f-codigo').requestSubmit();
    };
    $$('[data-inicio]').forEach((b) => b.addEventListener('click', () => abrir(b.dataset.inicio)));
    abrir(comCodigo ? 'codigo' : 'teste');
  }

  function formTeste(area) {
    area.innerHTML = `
      <form id="f-teste" class="stack" novalidate>
        <p class="teste-intro">7 dias com todos os recursos, sem cartão. Depois, é só escolher um plano e pagar por Pix. Nada do que você cadastrar no teste se perde.</p>
        <label class="field"><span>Nome da empresa</span><input name="nome" maxlength="80" autocomplete="organization" autofocus></label>
        <div class="grid-2">
          <label class="field"><span>CNPJ ou CPF</span><input name="cnpj" inputmode="numeric" maxlength="18" autocomplete="off"></label>
          <label class="field"><span>WhatsApp</span><input name="telefone" inputmode="tel" maxlength="20" placeholder="(81) 99999-9999" autocomplete="tel"></label>
        </div>
        <label class="field"><span>Cidade</span><input name="cidade" maxlength="60" placeholder="Opcional" autocomplete="address-level2"></label>
        <p class="form-error" role="alert" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">Começar meu teste grátis</button>
        <small class="muted">Um teste por e-mail e por CNPJ ou CPF.</small>
      </form>`;
    const f = $('#f-teste');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const dados = { nome: f.nome.value.trim(), cnpj: digitos(f.cnpj.value), telefone: digitos(f.telefone.value), cidade: f.cidade.value.trim() };
      if (!dados.nome) { f.nome.focus(); return showFormError(f, 'Informe o nome da empresa.'); }
      if (!docValido(dados.cnpj)) { f.cnpj.focus(); return showFormError(f, 'CNPJ ou CPF inválido. Confira os números.'); }
      if (dados.telefone.length < 10) { f.telefone.focus(); return showFormError(f, 'Informe o WhatsApp com DDD.'); }
      showFormError(f, '');
      const btn = f.querySelector('[type=submit]');
      setBusy(btn, true, 'Criando sua empresa…');
      try {
        const perfil = await DB.criarTeste(dados, { ...state.user, name: state.user.name || state.nomePendente || '' });
        state.nomePendente = null;
        toast('Teste grátis ativado. Aproveite os 7 dias!');
        abrirEmpresa(perfil);
      } catch (err) { showFormError(f, msgErro(err)); setBusy(btn, false); }
    });
  }

  function formCodigo(valor) {
    const area = $('#ativar-area');
    area.innerHTML = `
      <form id="f-codigo" novalidate class="stack">
        <label class="field"><span>Código de acesso</span>
          <input name="codigo" class="code-input" placeholder="EST-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(valor)}" autofocus></label>
        <p class="form-error" role="alert" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">Verificar código</button>
      </form>`;
    const f = $('#f-codigo');
    f.codigo.addEventListener('input', () => {
      const pos = f.codigo.selectionStart;
      f.codigo.value = f.codigo.value.toUpperCase();
      f.codigo.setSelectionRange(pos, pos);
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const codigo = f.codigo.value.trim();
      if (!codigo) return showFormError(f, 'Digite o código.');
      showFormError(f, '');
      const btn = f.querySelector('[type=submit]');
      setBusy(btn, true, 'Verificando…');
      try {
        const c = await DB.consultarCodigo(codigo);
        state.codigoPendente = null;
        if (c.tipo === 'renovacao') throw new Error('Este é um código de renovação. Ele é usado pelo responsável dentro do sistema, no menu Empresa.');
        confirmarCodigo(c);
      } catch (err) {
        state.codigoPendente = null;
        showFormError(f, msgErro(err)); setBusy(btn, false);
      }
    });
    if (!valor) setTimeout(() => f.codigo.focus(), 30);
  }

  function confirmarCodigo(c) {
    const empresa = c.tipo === 'empresa';
    const area = $('#ativar-area');
    area.innerHTML = `
      <div class="code-confirm">
        <span class="code-kind">${empresa ? 'Cadastro de empresa' : 'Convite para a equipe'}</span>
        <strong class="code-emp">${esc(c.empresaNome || 'Empresa')}</strong>
        <p>${empresa
          ? `Você será o responsável por esta empresa no Estokio: personaliza o sistema com o logo e as cores dela e convida até ${DB.MAX_USUARIOS - 1} pessoas para a equipe. O código inclui ${plural(num(c.dias) || 30, 'dia', 'dias')} de acesso.`
          : 'Você vai entrar na equipe e poderá cadastrar produtos e registrar entradas e saídas.'}</p>
        <p class="form-error" role="alert" hidden></p>
        <button class="btn btn-primary btn-block" id="btn-resgatar">${empresa ? 'Ativar empresa' : 'Entrar na equipe'}</button>
        <button class="link-btn" id="btn-outro">Usar outro código</button>
      </div>`;
    $('#btn-outro').onclick = () => formCodigo('');
    $('#btn-resgatar').onclick = async (e) => {
      const btn = e.currentTarget;
      setBusy(btn, true, empresa ? 'Ativando…' : 'Entrando…');
      try {
        const user = { ...state.user, name: state.user.name || state.nomePendente || '' };
        const perfil = await DB.resgatarCodigo(c, user);
        state.nomePendente = null;
        toast(empresa ? 'Empresa ativada.' : `Você entrou na equipe de ${c.empresaNome}.`);
        abrirEmpresa(perfil);
      } catch (err) {
        showFormError(area.querySelector('.code-confirm'), msgErro(err));
        setBusy(btn, false);
      }
    };
  }

  /* ================= planos e pagamento por Pix ================= */
  const emTeste = () => Boolean(state.empresa && state.empresa.planoId === 'teste');
  /** Catálogo em uso: o do Firestore, ou o padrão enquanto o admin ainda não o salvou. */
  const catalogoPlanos = () => Ass.catalogo(state.planos);
  const planosVenda = () => Ass.planosVendaveis(catalogoPlanos());
  /** Menor plano à venda que libera o recurso (para dizer "disponível a partir do Pro"). */
  const planoQueLibera = (k) => Ass.planoQueLibera(k, catalogoPlanos());
  /** Empresa em plano antigo (um por período): continua valendo, mas não é mais vendido. */
  const planoLegado = () => Boolean(state.empresa && !emTeste() && state.empresa.planoId && !state.empresa.planoPeriodo && !DB.apresentacao);
  const NOME_CURTO = { nfe: 'NF-e', lotes: 'Validade e lotes', grade: 'Grade', kits: 'Kits', etiquetas: 'Etiquetas', relatorios: 'Relatórios', multiloja: 'Multiloja' };

  function docValido(v) {
    const d = digitos(v);
    if (/^(\d)\1+$/.test(d)) return false;
    if (d.length === 11) {
      const calc = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
      return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
    }
    if (d.length === 14) {
      const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const calc = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * pesos[pesos.length - n + i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
      return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
    }
    return false;
  }

  function botaoSuporte(texto) {
    const w = digitos(state.config.whatsappSuporte);
    if (!w) return '';
    return `<a class="btn btn-block" href="https://wa.me/${waNumero(w)}?text=${encodeURIComponent(texto || `Olá! Preciso de ajuda com o Estokio da ${state.empresa ? state.empresa.nome : 'minha empresa'}.`)}" target="_blank" rel="noopener">${icon('whatsapp')}Falar com o suporte</a>`;
  }

  /** Re-desenha a escolha de plano (ou o Pix) aberta quando o catálogo ou os pedidos mudam. */
  function atualizarEscolhas() {
    $$('[data-escolha]').forEach((a) => montarEscolha(a));
    if (state.tela === 'shell' && (state.route === 'empresa' || state.route === 'importar' || state.route === 'equipe')) refresh();
    if (state.tela === 'shell') atualizarLateral();
  }

  /* ---------- escolha de plano ---------- */
  function montarEscolha(area) {
    area.dataset.escolha = '1';
    const pend = state.pedidos.find((p) => p.tipo === 'plano');
    if (pend) return pixPanel(area, pend);
    if (!state.loadedCatalogo) { area.innerHTML = '<p class="muted">Carregando planos…</p>'; return; }
    const planos = planosVenda();
    const emp = state.empresa;
    const atualPer = Ass.periodoPorDias(emp.planoDias);
    const E = state.esc || (state.esc = {
      planoId: (planos.find((p) => p.id === emp.planoId) || planos.find((p) => p.destaque) || planos[1] || planos[0]).id,
      periodo: emTeste() || !emp.planoPeriodo || !atualPer ? 'anual' : atualPer.id
    });
    if (!planos.find((p) => p.id === E.planoId)) E.planoId = (planos.find((p) => p.destaque) || planos[0]).id;
    const plano = planos.find((p) => p.id === E.planoId);
    const per = Ass.periodoDe(E.periodo) || Ass.PERIODOS[2];
    const usos = { usuarios: Math.max(state.membros.length, num(emp.totalUsuarios)), produtos: state.produtos.length };
    const orc = Ass.orcamento(plano, per.id);
    const restam = emTeste() ? 0 : Math.max(0, diasRestantes(emp) || 0);
    const ate = Math.max(Date.now(), restam ? num(emp.acessoAte) : 0) + orc.dias * DB.DIA;
    const perdidos = emTeste() ? [] : Ass.recursosPerdidos(emp.recursos, plano);
    // Limites só travam quem está trocando de plano: renovar o plano atual é sempre possível
    const bloqueios = (p) => (p.id === emp.planoId && !emTeste() ? [] : Ass.limitesExcedidos(p, usos));
    const cartao = (p, i) => {
      const sel = p.id === plano.id;
      const bloq = bloqueios(p);
      const atual = p.id === emp.planoId && !emTeste();
      const novos = Ass.novidadesDoPlano(p, catalogoPlanos()).map((k) => Ass.NOMES_RECURSOS[k] + (k === 'integracao' ? ' (em breve)' : ''));
      if (p.suportePrioritario) novos.push('Suporte prioritário pelo WhatsApp');
      return `
        <label class="plano-op ${sel ? 'is-sel' : ''} ${bloq.length ? 'is-off' : ''}">
          <input type="radio" name="esc-plano" value="${p.id}" ${sel ? 'checked' : ''} ${bloq.length ? 'disabled' : ''} class="sr-only">
          ${atual ? '<span class="po-selo po-selo-atual">Seu plano</span>' : p.destaque ? '<span class="po-selo">Mais escolhido</span>' : ''}
          <span class="po-nome">${esc(p.nome)}</span>
          <span class="po-preco">${cf.format(Ass.preco(p, per.id))}</span>
          <span class="po-per">${per.curto}</span>
          <span class="po-eq">${per.meses > 1 ? `${cf.format(Ass.equivalenteMes(p, per.id))} por mês` : 'sem fidelidade'}</span>
          <ul class="po-lista">
            <li>Até ${plural(num(p.maxUsuarios), 'usuário', 'usuários')}</li>
            <li>${num(p.maxProdutos) ? `Até ${nf.format(num(p.maxProdutos))} produtos` : 'Produtos ilimitados'}</li>
            ${i > 0 ? `<li class="po-base">Tudo do ${esc(planos[i - 1].nome)}, mais:</li>` : ''}
            ${novos.map((n) => `<li>${esc(n)}</li>`).join('')}
          </ul>
          ${bloq.length ? `<span class="po-bloq">${esc(bloq[0])}</span>` : ''}
        </label>`;
    };
    area.innerHTML = `
      <div class="escolha">
        <div class="periodos-op" role="radiogroup" aria-label="Período do plano">
          ${Ass.PERIODOS.map((x) => { const r = Ass.rotuloDesconto(plano, x.id); return `<button type="button" role="radio" aria-checked="${x.id === per.id}" data-esc-periodo="${x.id}" class="${x.id === per.id ? 'is-sel' : ''}">${x.nome}${r ? `<small>${r}</small>` : ''}</button>`; }).join('')}
        </div>
        <div class="planos-op">${planos.map(cartao).join('')}</div>
        ${perdidos.length ? `<p class="esc-aviso">Ao trocar para o ${esc(plano.nome)}, você deixa de ter: ${esc(perdidos.join(', '))}. Os dados continuam guardados.</p>` : ''}
        <div class="escolha-total">
          <div><span class="muted">Plano ${esc(plano.nome)}, ${per.nome.toLowerCase()}</span><strong>${cf.format(orc.total)}</strong></div>
          <span class="muted">Acesso até ${dfd.format(ate)}${restam ? `. Os ${plural(restam, 'dia que resta', 'dias que restam')} continuam valendo e entram somados` : ''}</span>
        </div>
        <p class="form-error" role="alert" hidden></p>
        <button class="btn btn-primary btn-block" data-esc-pagar ${bloqueios(plano).length ? 'disabled' : ''}>${icon('pix')}Pagar ${cf.format(orc.total)} por Pix</button>
      </div>`;
    area.onchange = (e) => { if (e.target.name === 'esc-plano') { E.planoId = e.target.value; montarEscolha(area); } };
    area.onclick = async (e) => {
      const bp = e.target.closest('[data-esc-periodo]');
      if (bp) { E.periodo = bp.dataset.escPeriodo; montarEscolha(area); return; }
      const pagar = e.target.closest('[data-esc-pagar]');
      if (!pagar) return;
      setBusy(pagar, true, 'Gerando Pix…');
      try {
        const pedido = await DB.criarPedido({
          tipo: 'plano', empresaNome: emp.nome, planoId: plano.id, planoNome: plano.nome, periodo: orc.periodo, dias: orc.dias,
          itens: orc.itens, valor: orc.total, txid: Pix.novoTxid()
        }, state.user);
        if (!state.pedidos.find((p) => p.id === pedido.id)) state.pedidos = [pedido, ...state.pedidos];
        pixPanel(area, pedido);
      } catch (err) { showFormError(area, msgErro(err)); setBusy(pagar, false); }
    };
  }

  /* ---------- Pix do pedido ---------- */
  function pixPanel(area, pedido) {
    const c = state.config;
    const volta = () => montarEscolha(area);
    const resumo = Ass.descreverItens(pedido.itens || []);
    const texto = `Olá! Paguei o Pix de ${cf.format(pedido.valor)} do Estokio para ${state.empresa.nome} (${resumo}). Identificador: ${pedido.txid}. Segue o comprovante.`;
    let codigo = '';
    try { if (c.chavePix) codigo = Pix.payload({ chave: c.chavePix, tipoChave: c.tipoChave, nome: c.nomeRecebedor, cidade: c.cidadeRecebedor, valor: pedido.valor, txid: pedido.txid }); } catch (e) { codigo = ''; }
    area.innerHTML = `
      <div class="pix-box">
        <div class="pix-head">
          <span class="code-kind">Pagamento por Pix</span>
          <strong class="pix-valor">${cf.format(pedido.valor)}</strong>
          <span class="muted">${esc(resumo)}</span>
        </div>
        ${codigo ? `
        <div class="pix-qr" aria-label="QR Code do Pix"><span class="muted">Gerando QR Code…</span></div>
        <label class="field"><span>Pix copia e cola</span><textarea readonly rows="3" class="pix-cc">${esc(codigo)}</textarea></label>
        <button type="button" class="btn btn-block" data-pix-copiar>${icon('copiar')}Copiar código Pix</button>
        <p class="pix-info">Recebedor: <strong>${esc(c.nomeRecebedor || '')}</strong>. Identificador do pagamento: <strong>${esc(pedido.txid)}</strong>. O sistema é liberado assim que o pagamento for confirmado, normalmente em poucos minutos no horário comercial. Esta tela se atualiza sozinha.</p>
        ${digitos(c.whatsappSuporte) ? `<a class="btn btn-primary btn-block" href="https://wa.me/${waNumero(c.whatsappSuporte)}?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">${icon('whatsapp')}Já paguei, enviar comprovante</a>` : ''}`
        : `<p class="confirm-text">O pagamento por Pix ainda não está disponível. Fale com o suporte do Estokio para concluir.</p>${botaoSuporte(texto)}`}
        <button type="button" class="link-btn pix-outro" data-pix-cancelar>Cancelar e escolher outra opção</button>
      </div>`;
    area.onchange = null;
    area.onclick = async (e) => {
      if (e.target.closest('[data-pix-copiar]')) return copiar(codigo);
      if (!e.target.closest('[data-pix-cancelar]')) return;
      try {
        await DB.cancelarPedido(pedido.id);
        state.pedidos = state.pedidos.filter((p) => p.id !== pedido.id);
        volta();
      } catch (err) { toast(msgErro(err), 'erro'); }
    };
    const qr = area.querySelector('.pix-qr');
    if (qr) Pix.desenharQR(qr, codigo, 216).catch((err) => { qr.innerHTML = `<p class="muted">${esc(err.message)}</p>`; });
  }

  function abrirEscolha(planoId) {
    if (planoId) state.esc = { planoId, periodo: (state.esc && state.esc.periodo) || 'anual' };
    const m = openModal(`${modalHead(emTeste() ? 'Escolha seu plano' : 'Renovar ou mudar de plano')}<div class="modal-body" id="escolha-modal"></div>`, { wide: true, semFoco: true });
    montarEscolha($('#escolha-modal', m));
  }

  /** Cartão com cadeado para um recurso que o plano atual não traz. */
  function cardBloqueado(plano, titulo, texto) {
    return `
      <section class="panel lock-card">
        <span class="lock-ico" aria-hidden="true">${icon('cadeado')}</span>
        <div class="lock-txt">
          <h2>${titulo}</h2>
          <p>${texto}</p>
          ${plano ? `<p class="lock-preco">Disponível a partir do plano <strong>${esc(plano.nome)}</strong>, por ${cf.format(Ass.preco(plano, 'mensal'))} por mês.</p>` : ''}
        </div>
        ${!ehDono() ? '<p class="muted lock-acao">Peça ao responsável pela empresa para mudar de plano.</p>'
          : plano ? `<button class="btn btn-primary lock-acao" data-action="escolher-plano" data-plano="${plano.id}">Ver planos</button>` : ''}
      </section>`;
  }

  /** Próximo plano com mais vagas de usuário do que o atual. */
  const maisVagas = () => planosVenda().find((p) => num(p.maxUsuarios) > (num(state.empresa.maxUsuarios) || 5)) || null;

  /* ---------- acesso vencido ---------- */
  function telaVencida() {
    const emp = state.empresa;
    const teste = emTeste();
    const quando = emp.acessoAte ? ` em ${df.format(emp.acessoAte)}` : '';
    if (!ehDono()) {
      telaMensagem(teste ? 'O teste grátis terminou' : 'O acesso venceu',
        `${teste ? `O teste grátis de <strong>${esc(emp.nome)}</strong> terminou${quando}` : `O acesso de <strong>${esc(emp.nome)}</strong> ao Estokio venceu${quando}`}. Os dados continuam guardados. Peça ao responsável pela empresa para escolher um plano.`);
      state.tela = 'vencida';
      return;
    }
    state.tela = 'vencida';
    closeModal();
    mostrar('tela');
    $('#tela').innerHTML = `
      <div class="gate"><div class="gate-card gate-wide">
        ${marcaEstokio}
        <h1>${teste ? 'Seu teste grátis terminou' : 'O acesso venceu'}</h1>
        <p>${teste
          ? `Tudo o que você cadastrou em <strong>${esc(emp.nome)}</strong> continua guardado. Escolha um plano e pague por Pix para continuar de onde parou.`
          : `O acesso de <strong>${esc(emp.nome)}</strong> venceu${quando}. Os dados continuam guardados. Escolha um plano e pague por Pix para liberar o sistema.`}</p>
        <div id="escolha-area"></div>
        <details class="codigo-det"><summary>Tenho um código de renovação</summary><div id="renovar-area" class="renovar-area"></div></details>
        <button class="link-btn gate-out" data-action="logout">Sair</button>
      </div></div>`;
    montarEscolha($('#escolha-area'));
    formRenovacao($('#renovar-area'));
  }

  /** Formulário do código REN. Usado na tela de vencimento e no menu Empresa. */
  function formRenovacao(area) {
    area.innerHTML = `
      <form class="renovar-form stack" novalidate>
        <label class="field"><span>Código de renovação</span>
          <input name="codigo" class="code-input" placeholder="REN-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
        <p class="form-error" role="alert" hidden></p>
        <button class="btn btn-primary" type="submit">Verificar código</button>
        <small class="muted">Pode usar antes de vencer: os dias do código são somados ao prazo atual.</small>
      </form>`;
    const f = area.querySelector('form');
    f.codigo.addEventListener('input', () => { f.codigo.value = f.codigo.value.toUpperCase(); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!f.codigo.value.trim()) return showFormError(f, 'Digite o código de renovação.');
      showFormError(f, '');
      const btn = f.querySelector('[type=submit]');
      setBusy(btn, true, 'Verificando…');
      try {
        const c = await DB.consultarCodigo(f.codigo.value);
        if (c.tipo !== 'renovacao') throw new Error('Este não é um código de renovação. Códigos de renovação começam com REN.');
        if (c.empresaId !== state.perfil.empresaId) throw new Error('Este código de renovação foi gerado para outra empresa.');
        confirmarRenovacao(area, c);
      } catch (err) { showFormError(f, msgErro(err)); setBusy(btn, false); }
    });
  }

  function confirmarRenovacao(area, c) {
    const dias = num(c.dias);
    const novo = Math.max(Date.now(), num(state.empresa.acessoAte)) + dias * DB.DIA;
    area.innerHTML = `
      <div class="code-confirm">
        <span class="code-kind">Código de renovação</span>
        <strong class="code-emp">+${plural(dias, 'dia', 'dias')} de acesso</strong>
        <p>O acesso passa a valer até <strong>${dfd.format(novo)}</strong>.</p>
        <p class="form-error" role="alert" hidden></p>
        <button class="btn btn-primary btn-block" data-renovar>Aplicar renovação</button>
        <button type="button" class="link-btn" data-voltar>Usar outro código</button>
      </div>`;
    const box = area.querySelector('.code-confirm');
    box.querySelector('[data-voltar]').onclick = () => formRenovacao(area);
    box.querySelector('[data-renovar]').onclick = async (e) => {
      const btn = e.currentTarget;
      setBusy(btn, true, 'Aplicando…');
      try {
        const ate = await DB.renovarAcesso(c, state.empresa, state.user);
        toast(`Acesso renovado até ${dfd.format(ate)}.`);
        if (area.isConnected) formRenovacao(area);
      } catch (err) { showFormError(box, msgErro(err)); setBusy(btn, false); }
    };
  }

  /* ---------- configurar empresa (primeiro acesso do responsável) ---------- */
  function telaSetup() {
    state.tela = 'setup';
    closeModal();
    mostrar('tela');
    const emp = state.empresa;
    $('#tela').innerHTML = `
      <div class="setup">
        <header class="setup-head">${marcaEstokio}<button class="link-btn" data-action="logout">Sair</button></header>
        <div class="setup-intro">
          <h1>Configure sua empresa no Estokio</h1>
          <p>Confira os dados, envie o logo e escolha as cores. Tudo isso aparece para a sua equipe e pode ser mudado depois, no menu Empresa.</p>
        </div>
        ${empresaFormHTML(emp, 'setup')}
      </div>`;
    montarEmpresaForm($('#f-emp'), emp, 'setup');
  }

  /* ---------- formulário de empresa (setup e menu Empresa) ---------- */
  function logoHTML(emp, classe) {
    const src = logoSeguro(emp.logo);
    return src ? `<img class="${classe}-img" src="${esc(src)}" alt="">` : `<span class="${classe}-ini">${esc(Marca.iniciais(emp.nome))}</span>`;
  }

  /** Central de Privacidade: quando aceitou os termos, baixar os dados, e pedir (ou cancelar) a exclusão definitiva. */
  function lgpdBodyHTML() {
    const emp = state.empresa, pedido = emp && emp.pedidoExclusao;
    const info = state.aceiteInfo;
    return `
      <p>Baixe uma cópia completa dos dados da empresa no Estokio: produtos, movimentações, fornecedores, categorias, notas lançadas e usuários, num arquivo JSON.</p>
      ${info && typeof info === 'object' ? `<p class="muted">Você aceitou os <a href="../termos.html" target="_blank" rel="noopener">termos do Estokio</a> (versão ${esc(info.versao)}) em ${df.format(msDe(info.aceitoEm))}.</p>` : ''}
      <button class="btn" data-action="exportar-dados">${icon('exportar')}Baixar todos os dados</button>
      ${!ehDono() ? '' : pedido ? `
      <div class="exclusao-pend">
        <p><strong>Pedido de exclusão enviado em ${df.format(msDe(pedido.solicitadoEm))}.</strong> Assim que revisarmos, a empresa e todos os dados são apagados definitivamente, sem volta. Enquanto isso, o sistema continua funcionando normalmente.</p>
        <button class="btn" data-action="cancelar-exclusao">Cancelar o pedido</button>
      </div>` : `
      <div class="exclusao-bloco">
        <p class="muted">Quer encerrar de vez? Você pode pedir a exclusão definitiva da empresa e de todos os dados, um direito garantido pela LGPD.</p>
        <button class="btn btn-danger" data-action="pedir-exclusao">${icon('excluir')}Solicitar exclusão da minha conta</button>
      </div>`}`;
  }

  function empresaFormHTML(emp, modo) {
    const p = Marca.hexOk(emp.corPrimaria) ? emp.corPrimaria : Marca.PADRAO.corPrimaria;
    const d = Marca.hexOk(emp.corDestaque) ? emp.corDestaque : Marca.PADRAO.corDestaque;
    return `
      <form id="f-emp" class="emp-form" novalidate>
        <div class="emp-cols">
          <div class="emp-fields">
            <section class="emp-sec">
              <h2>Dados da empresa</h2>
              <label class="field"><span>Nome que aparece no sistema</span><input name="nome" maxlength="80" required value="${esc(emp.nome)}"></label>
              <div class="grid-2">
                <label class="field"><span>CNPJ</span><input name="cnpj" inputmode="numeric" maxlength="18" placeholder="Opcional" value="${esc(emp.cnpj)}"></label>
                <label class="field"><span>Telefone</span><input name="telefone" inputmode="tel" maxlength="20" placeholder="Opcional" value="${esc(emp.telefone)}"></label>
                <label class="field span-2"><span>Cidade</span><input name="cidade" maxlength="60" placeholder="Opcional" value="${esc(emp.cidade)}"></label>
              </div>
            </section>

            <section class="emp-sec">
              <h2>Logo</h2>
              <div class="logo-up">
                <div class="logo-box" id="logo-box">${logoHTML(emp, 'logo')}</div>
                <div class="logo-actions">
                  <label class="btn btn-sm file-btn">${icon('imagem')}<span id="logo-label">${logoSeguro(emp.logo) ? 'Trocar imagem' : 'Escolher imagem'}</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" id="logo-file" class="sr-only"></label>
                  <button type="button" class="link-btn" id="logo-remover" ${logoSeguro(emp.logo) ? '' : 'hidden'}>Remover logo</button>
                  <small class="muted">PNG com fundo transparente fica melhor. A imagem é reduzida automaticamente.</small>
                </div>
              </div>
            </section>

            <section class="emp-sec">
              <h2>Cores</h2>
              <div class="swatches" role="group" aria-label="Combinações prontas">
                ${Marca.COMBINACOES.map((c) => `<button type="button" class="swatch" data-p="${c.corPrimaria}" data-d="${c.corDestaque}" title="${c.nome}" aria-label="Usar combinação ${c.nome}"><span style="background:${c.corPrimaria}"></span><span style="background:${c.corDestaque}"></span></button>`).join('')}
              </div>
              <div class="grid-2">
                <div class="field"><label for="cor-p">Cor do menu</label>
                  <div class="color-row"><input type="color" id="cor-p" name="corPrimaria" value="${p}"><input type="text" data-hex="corPrimaria" maxlength="7" value="${p.toUpperCase()}" aria-label="Código da cor do menu" spellcheck="false"></div></div>
                <div class="field"><label for="cor-d">Cor dos botões e destaques</label>
                  <div class="color-row"><input type="color" id="cor-d" name="corDestaque" value="${d}"><input type="text" data-hex="corDestaque" maxlength="7" value="${d.toUpperCase()}" aria-label="Código da cor dos botões" spellcheck="false"></div></div>
              </div>
            </section>
          </div>

          <aside class="emp-preview" aria-label="Prévia de como o sistema vai ficar">
            <span class="prev-title">Prévia</span>
            <div class="mini-app" id="mini-app">
              <div class="mini-side">
                <div class="mini-brand"><span class="mini-logo" id="mini-logo">${logoHTML(emp, 'mini')}</span><span id="mini-nome">${esc(emp.nome)}</span></div>
                <span class="mini-nav on">Painel</span><span class="mini-nav">Produtos</span><span class="mini-nav">Movimentações</span><span class="mini-nav">Equipe</span>
              </div>
              <div class="mini-main">
                <div class="mini-top"><span class="mini-h">Painel</span><span class="mini-btn">Novo produto</span></div>
                <div class="mini-card">
                  <span class="mini-row"><span>Detergente neutro</span>${gauge({ quantidade: 42, estoqueMinimo: 30 })}</span>
                  <span class="mini-row"><span>Papel A4</span>${gauge({ quantidade: 9, estoqueMinimo: 15 })}</span>
                  <span class="mini-row"><span>Desinfetante 2 L</span>${gauge({ quantidade: 0, estoqueMinimo: 12 })}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
        <p class="form-error" role="alert" hidden></p>
        <div class="emp-foot"><button type="submit" class="btn btn-primary">${modo === 'setup' ? 'Salvar e começar' : 'Salvar alterações'}</button></div>
      </form>`;
  }

  function montarEmpresaForm(form, emp, modo) {
    let logo = logoSeguro(emp.logo) || null;
    const mini = $('#mini-app', form);

    function atualizarPrevia() {
      Marca.aplicar({ corPrimaria: form.corPrimaria.value, corDestaque: form.corDestaque.value }, mini);
      const nome = form.nome.value.trim() || emp.nome;
      $('#mini-nome', form).textContent = nome;
      const fake = { nome, logo };
      $('#mini-logo', form).innerHTML = logoHTML(fake, 'mini');
      $('#logo-box', form).innerHTML = logoHTML(fake, 'logo');
      $('#logo-remover', form).hidden = !logo;
      $('#logo-label', form).textContent = logo ? 'Trocar imagem' : 'Escolher imagem';
      $$('.swatch', form).forEach((s) => s.setAttribute('aria-pressed', String(
        s.dataset.p.toLowerCase() === form.corPrimaria.value.toLowerCase() && s.dataset.d.toLowerCase() === form.corDestaque.value.toLowerCase())));
    }

    form.addEventListener('input', (e) => {
      const t = e.target;
      if (t.type === 'color') { $(`[data-hex="${t.name}"]`, form).value = t.value.toUpperCase(); }
      if (t.dataset.hex) {
        let v = t.value.trim(); if (v && v[0] !== '#') v = '#' + v;
        if (Marca.hexOk(v)) form[t.dataset.hex].value = v.toLowerCase();
      }
      atualizarPrevia();
    });
    form.addEventListener('click', (e) => {
      const s = e.target.closest('.swatch');
      if (!s) return;
      form.corPrimaria.value = s.dataset.p.toLowerCase(); form.corDestaque.value = s.dataset.d.toLowerCase();
      $('[data-hex="corPrimaria"]', form).value = s.dataset.p.toUpperCase();
      $('[data-hex="corDestaque"]', form).value = s.dataset.d.toUpperCase();
      atualizarPrevia();
    });
    $('#logo-file', form).addEventListener('change', async (e) => {
      const arq = e.target.files[0];
      e.target.value = '';
      if (!arq) return;
      try { logo = await Marca.processarLogo(arq); atualizarPrevia(); showFormError(form, ''); }
      catch (err) { showFormError(form, err.message); }
    });
    $('#logo-remover', form).addEventListener('click', () => { logo = null; atualizarPrevia(); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = form.nome.value.trim();
      if (!nome) { form.nome.focus(); return showFormError(form, 'Informe o nome da empresa.'); }
      showFormError(form, '');
      const dados = {
        nome,
        cnpj: form.cnpj.value.trim(),
        telefone: form.telefone.value.trim(),
        cidade: form.cidade.value.trim(),
        logo: logo || null,
        corPrimaria: form.corPrimaria.value.toLowerCase(),
        corDestaque: form.corDestaque.value.toLowerCase(),
        configurado: true
      };
      const btn = form.querySelector('[type=submit]');
      setBusy(btn, true);
      try {
        await DB.saveEmpresa(dados);
        toast(modo === 'setup' ? 'Tudo pronto. Bem-vindo ao Estokio.' : 'Alterações salvas.');
        setBusy(btn, false);
      } catch (err) { showFormError(form, msgErro(err)); setBusy(btn, false); }
    });

    atualizarPrevia();
  }

  /* ================= primeiro acesso guiado ================= */
  const chaveOnb = (k) => `estokio:onb:${state.empresa ? state.empresa.id : 'x'}:${k}`;
  const lerOnb = (k) => { try { return localStorage.getItem(chaveOnb(k)); } catch (e) { return null; } };
  const gravarOnb = (k, v = '1') => { try { localStorage.setItem(chaveOnb(k), v); } catch (e) { /* sem armazenamento */ } };
  const OBS_AUTOMATICAS = ['Estoque inicial', 'Importação de planilha'];

  /** Passos do primeiro acesso. Cada um se marca sozinho a partir dos dados da empresa. */
  function passosOnboarding() {
    const emp = state.empresa || {};
    const padraoCores = (!emp.corPrimaria || emp.corPrimaria.toLowerCase() === '#16233a') && (!emp.corDestaque || emp.corDestaque.toLowerCase() === '#f2b705');
    const passos = [
      { k: 'marca', titulo: 'Deixe o sistema com a cara da empresa', texto: 'Envie o logo e escolha as cores. A equipe toda passa a ver o Estokio assim.',
        feito: Boolean(emp.logo) || !padraoCores, acao: '<a class="btn btn-sm" href="#/empresa">Enviar logo e cores</a>' },
      { k: 'produtos', titulo: 'Cadastre pelo menos 3 produtos', texto: `Um por um ou de uma vez, pela planilha.${state.produtos.length ? ` Você tem ${plural(state.produtos.length, 'produto', 'produtos')}.` : ''}`,
        feito: state.produtos.length >= 3,
        acao: `<button class="btn btn-sm" data-action="novo-produto">Cadastrar produto</button>${recurso('importacao') ? '<a class="btn btn-sm" href="#/importar">Importar planilha</a>' : ''}` },
      { k: 'minimo', titulo: 'Defina o estoque mínimo', texto: 'É com ele que o Estokio avisa o que precisa de reposição. Abra um produto e preencha "Estoque mínimo".',
        feito: state.produtos.some((p) => num(p.estoqueMinimo) > 0), acao: '<a class="btn btn-sm" href="#/produtos">Abrir produtos</a>' },
      { k: 'movimento', titulo: 'Registre uma entrada ou uma saída', texto: 'Cada movimento atualiza o estoque na hora e fica no histórico.',
        feito: state.movs.some((m) => !OBS_AUTOMATICAS.includes(m.observacao)), acao: '<button class="btn btn-sm" data-action="nova-mov">Registrar movimentação</button>' }
    ];
    if (recurso('leitor')) {
      passos.push({ k: 'leitor', titulo: 'Leia um código de barras', texto: 'Pelo celular, aponte a câmera para o código de um produto. No computador, um leitor USB também funciona.',
        feito: Boolean(lerOnb('leitor')) || state.produtos.some((p) => p.codigoBarras), acao: '<button class="btn btn-sm" data-action="escanear">Ler código</button>' });
    }
    passos.push({ k: 'equipe', titulo: 'Convide alguém da equipe', texto: 'Cada pessoa tem o próprio login, e você vê quem registrou cada movimento.',
      feito: state.membros.length >= 2 || state.convites.length > 0, acao: '<a class="btn btn-sm" href="#/equipe">Convidar pessoa</a>' });
    return passos;
  }

  function painelOnboarding() {
    if (!ehDono() || lerOnb('oculto') || !state.loaded.produtos || !state.loaded.movimentacoes) return '';
    const passos = passosOnboarding();
    const feitos = passos.filter((p) => p.feito).length;
    const pct = Math.round((feitos / passos.length) * 100);
    const dT = diasRestantes(state.empresa);
    const tudo = feitos === passos.length;
    return `
      <section class="panel onb ${tudo ? 'is-pronto' : ''}" aria-label="Primeiros passos">
        <header class="onb-cab">
          <div>
            <h2>${tudo ? 'Tudo pronto' : 'Primeiros passos'}</h2>
            <p class="muted">${tudo ? 'Seu estoque está configurado. Agora é só registrar o dia a dia.' : `${feitos} de ${passos.length} concluídos${emTeste() && dT > 0 ? `. Seu teste grátis termina em ${plural(dT, 'dia', 'dias')}.` : '.'}`}</p>
          </div>
          <button class="link-btn" data-action="onb-ocultar">${tudo ? 'Fechar' : 'Ocultar'}</button>
        </header>
        <span class="onb-regua" role="progressbar" aria-valuemin="0" aria-valuemax="${passos.length}" aria-valuenow="${feitos}" aria-label="Passos concluídos"><span style="width:${pct}%"></span></span>
        ${tudo ? '' : `<ol class="onb-lista">${passos.map((p) => `
          <li class="${p.feito ? 'is-feito' : ''}">
            <span class="onb-marca" aria-hidden="true">${p.feito ? icon('ok') : ''}</span>
            <div class="onb-txt"><strong>${p.titulo}</strong><span>${p.texto}</span></div>
            <div class="onb-acao">${p.feito ? '<span class="onb-ok">Feito</span>' : p.acao}</div>
          </li>`).join('')}</ol>`}
      </section>`;
  }

  /** Mensagem de boas-vindas: uma única vez, na primeira entrada do responsável. */
  function boasVindas() {
    if (!ehDono() || lerOnb('boasvindas')) return;
    gravarOnb('boasvindas');
    openModal(`${modalHead(`Boas-vindas ao Estokio`)}
      <div class="modal-body">
        <p class="confirm-text">O sistema da <strong>${esc(state.empresa.nome)}</strong> está pronto. Em poucos passos o estoque começa a trabalhar por você:</p>
        <ol class="onb-resumo">
          <li><strong>Cadastre os produtos</strong>, um por um ou pela planilha.</li>
          <li><strong>Defina o estoque mínimo</strong> de cada um, para receber o aviso de reposição.</li>
          <li><strong>Registre as entradas e saídas</strong> do dia a dia.</li>
        </ol>
        <p class="muted">No Painel há uma lista de primeiros passos que se marca sozinha conforme você avança.${emTeste() ? ' Aproveite: no teste grátis todos os recursos estão liberados.' : ''}</p>
      </div>
      <footer class="modal-foot"><button class="btn btn-primary" data-action="close-modal" autofocus>Começar</button></footer>`);
  }

  /* ================= apresentação comercial (?demo=1) ================= */
  const urlCadastro = () => `${location.pathname}?cadastro=1`;
  const embutido = DB.apresentacao && new URLSearchParams(location.search).has('embed');
  if (embutido) document.documentElement.classList.add('embutido');
  const urlEntrar = () => `${location.pathname}?entrar=1`;
  const lerSessao = (k) => { try { return JSON.parse(sessionStorage.getItem(`estokio:apres:${k}`) || 'null'); } catch (e) { return null; } };
  const gravarSessao = (k, v) => { try { sessionStorage.setItem(`estokio:apres:${k}`, JSON.stringify(v)); } catch (e) { /* ignora */ } };

  function passosTour() {
    const refri = state.produtos.find((p) => p.sku === 'BEB-002') || state.produtos.find((p) => p.codigoBarras);
    return [
      { k: 'compras', titulo: 'Veja o que precisa de reposição', texto: 'O painel avisa a hora certa de pedir: considera o mínimo, o consumo, o prazo de entrega de cada fornecedor e os lotes que vão vencer. A lista de compras sai pronta, separada por fornecedor.', acao: '<a class="btn btn-sm" href="#/compras">Abrir lista de compras</a>' },
      { k: 'mov', titulo: 'Registre uma venda', texto: 'Escolha um produto e registre a saída. O estoque, o painel e a previsão mudam na hora.', acao: '<button class="btn btn-sm" data-action="nova-mov">Registrar movimentação</button>' },
      { k: 'leitor', titulo: 'Leia um código de barras', texto: `No celular, é só apontar a câmera. Aqui, digite ${refri && refri.codigoBarras ? `<strong>${esc(refri.codigoBarras)}</strong>` : 'um código'} no campo do leitor para simular.`, acao: '<button class="btn btn-sm" data-action="escanear">Ler código</button>' },
      { k: 'validades', titulo: 'Confira o que está vencendo', texto: 'Lotes vencidos e os que vencem esta semana, com o valor em risco e baixa em um clique.', acao: '<a class="btn btn-sm" href="#/validades">Abrir validades</a>' },
      { k: 'relatorios', titulo: 'Descubra onde está o dinheiro', texto: 'Curva ABC, giro de estoque e os produtos parados que estão prendendo o seu caixa.', acao: '<a class="btn btn-sm" href="#/relatorios">Abrir relatórios</a>' },
      { k: 'grades', titulo: 'Veja uma grade de tamanhos e cores', texto: 'Os chinelos têm estoque por tamanho e por cor, numa tabela só.', acao: '<a class="btn btn-sm" href="#/grades">Abrir grades</a>' },
      { k: 'empresa', titulo: 'Troque as cores e o logo', texto: 'Experimente outra combinação de cores: o sistema inteiro muda na hora, com a cara da sua loja.', acao: '<a class="btn btn-sm" href="#/empresa">Personalizar</a>' }
    ];
  }

  /** Marca um item do roteiro e, depois de 3, convida para o cadastro (uma vez por visita). */
  function marcarTour(k) {
    if (!DB.apresentacao) return;
    const feitos = lerSessao('tour') || [];
    if (feitos.includes(k)) return;
    feitos.push(k);
    gravarSessao('tour', feitos);
    if (feitos.length >= 3 && !lerSessao('convite') && !embutido) { gravarSessao('convite', true); setTimeout(conviteFlutuante, 1200); }
  }

  function painelTour() {
    const feitos = lerSessao('tour') || [];
    const passos = passosTour();
    const n = passos.filter((p) => feitos.includes(p.k)).length;
    return `
      <section class="panel onb tour" aria-label="Explore a demonstração">
        <header class="onb-cab">
          <div>
            <h2>Explore a demonstração</h2>
            <p class="muted">Uma loja fictícia com 60 dias de movimento. Mexa à vontade: nada aqui vai para a nuvem. ${n ? `Você já viu ${n} de ${passos.length}.` : ''}</p>
          </div>
          <a class="btn btn-primary btn-sm" href="${urlCadastro()}">Criar minha conta grátis</a>
        </header>
        <span class="onb-regua" aria-hidden="true"><span style="width:${Math.round((n / passos.length) * 100)}%"></span></span>
        <ol class="onb-lista">${passos.map((p) => { const ok = feitos.includes(p.k); return `
          <li class="${ok ? 'is-feito' : ''}">
            <span class="onb-marca" aria-hidden="true">${ok ? icon('ok') : ''}</span>
            <div class="onb-txt"><strong>${p.titulo}</strong><span>${p.texto}</span></div>
            <div class="onb-acao">${p.acao}</div>
          </li>`; }).join('')}</ol>
      </section>`;
  }
  const blocoInicio = () => (DB.apresentacao ? painelTour() : painelOnboarding());

  /** Os destaques da boas-vindas saem dos dados da loja, para nunca prometer o que a tela não mostra. */
  function destaquesApresentacao() {
    const out = [];
    // Destaca um produto cujo aviso depende do prazo do fornecedor (o recurso novo); senão, o mais urgente
    const lista = produtosParaPedir();
    const repor = lista.find((p) => avaliar(p).motivos.some((m) => m.tipo === 'prazo' && /fornecedor/.test(m.texto))) || lista[0];
    if (repor) {
      const m = avaliar(repor).motivos.find((x) => x.tipo === 'prazo' && /fornecedor/.test(x.texto)) || avaliar(repor).motivos[0];
      out.push(`<strong>Hora de pedir:</strong> ${esc(repor.nome)}. ${esc(m.texto)}.`);
    }

    const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
    const vencidos = state.produtos.filter((p) => p.controlaValidade && (p.lotes || []).some((l) => l.validade && l.validade < hoje0.getTime() && num(l.quantidade) > 0));
    if (vencidos.length) out.push(`<strong>Validades:</strong> ${vencidos.length === 1 ? `há ${esc(vencidos[0].nome).toLowerCase()} vencido` : `${vencidos.length} produtos têm lotes vencidos`} na prateleira.`);
    else out.push('<strong>Validades:</strong> veja os lotes que vencem nesta semana.');
    const parado = state.produtos.filter((p) => num(p.quantidade) > 0 && mediaDia(p) === 0).reduce((s, p) => s + num(p.quantidade) * num(p.custo), 0);
    out.push(parado > 0 ? `<strong>Relatórios:</strong> ${cf.format(parado)} parados em produtos que não vendem.` : '<strong>Relatórios:</strong> veja quais produtos concentram o valor das vendas.');
    return out;
  }

  function boasVindasApresentacao() {
    if (lerSessao('boasvindas')) return;
    gravarSessao('boasvindas', true);
    openModal(`${modalHead('Conheça o Estokio por dentro')}
      <div class="modal-body">
        <p class="confirm-text">Este é o sistema do <strong>Mercadinho Boa Vista</strong>, uma loja fictícia com 60 dias de vendas, compras e validades. Tudo funciona de verdade: registre vendas, leia códigos, gere a lista de compras.</p>
        <ul class="onb-resumo">${destaquesApresentacao().map((d) => `<li>${d}</li>`).join('')}</ul>
        <p class="muted">Nada do que você fizer aqui vai para a nuvem, e você pode recomeçar quando quiser.</p>
        <p class="ja-cliente">Já é cliente? <a href="${urlEntrar()}">Entrar na minha conta</a></p>
      </div>
      <footer class="modal-foot"><a class="btn" href="${urlCadastro()}">Criar minha conta</a><button class="btn btn-primary" data-action="close-modal" autofocus>Explorar a demonstração</button></footer>`, { semFoco: true });
  }

  /** Convite para o cadastro quando algo da demonstração depende de uma conta de verdade. */
  function convitePara(motivo) {
    openModal(`${modalHead('Isso funciona na sua conta')}
      <div class="modal-body">
        <p class="confirm-text">${motivo}</p>
        <p class="muted">Crie a sua conta e use o Estokio com os seus produtos: 7 dias grátis com todos os recursos, sem cartão.</p>
      </div>
      <footer class="modal-foot"><button class="btn" data-action="close-modal">Continuar explorando</button><a class="btn btn-primary" href="${urlCadastro()}">Criar minha conta grátis</a></footer>`);
  }

  function conviteFlutuante() {
    if (!DB.apresentacao || $('#convite-flutuante')) return;
    const el = document.createElement('aside');
    el.id = 'convite-flutuante';
    el.className = 'convite-flutuante';
    el.setAttribute('aria-label', 'Convite para criar conta');
    el.innerHTML = `
      <button class="icon-btn" data-fechar-convite aria-label="Fechar">${icon('fechar')}</button>
      <strong>Gostou? Use com os seus produtos.</strong>
      <span>7 dias grátis, com tudo liberado. Sem cartão.</span>
      <a class="btn btn-primary btn-block" href="${urlCadastro()}">Criar minha conta grátis</a>`;
    document.body.appendChild(el);
    el.querySelector('[data-fechar-convite]').onclick = () => el.remove();
  }

  /* ================= views do aplicativo ================= */
  const emptyState = (titulo, texto, acao) => `
    <div class="empty">
      <div class="empty-art" aria-hidden="true"><span></span><span></span><span></span></div>
      <h2>${titulo}</h2><p>${texto}</p>${acao || ''}
    </div>`;
  const loading = () => `<div class="loading">Carregando dados…</div>`;

  const views = {
    /* ---------- Painel ---------- */
    painel: {
      actions: () => `
        ${botaoLer()}
        <button class="btn" data-action="nova-mov">${icon('movimentacoes')}Registrar movimentação</button>
        ${pode('estoque') ? `<button class="btn btn-primary" data-action="novo-produto">${icon('plus')}Novo produto</button>` : ''}`,
      shell: () => `<div id="view-body"></div>`,
      body() {
        if (!state.loaded.produtos) return loading();
        const ps = state.produtos;
        if (!ps.length) {
          return blocoInicio() + emptyState('Seu estoque está vazio', 'Cadastre o primeiro produto para começar a acompanhar entradas, saídas e reposições.',
            `<button class="btn btn-primary" data-action="novo-produto">${icon('plus')}Cadastrar primeiro produto</button>`);
        }
        const valor = ps.reduce((s, p) => s + num(p.quantidade) * num(p.custo), 0);
        const venda = ps.reduce((s, p) => s + num(p.quantidade) * num(p.preco), 0);
        const alerta = produtosParaPedir();
        const cobertos = ps.filter((p) => avaliar(p).coberto);
        const zerados = alerta.filter((p) => nivel(p) === 'zerado').length;
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        const movsHoje = state.movs.filter((m) => m.criadoEm >= hoje.getTime());
        const ent = movsHoje.filter((m) => m.tipo === 'entrada').length;
        const sai = movsHoje.filter((m) => m.tipo === 'saida').length;

        return `
        ${blocoInicio()}
        ${blocoAprovacoes()}
        <section class="stats" aria-label="Resumo do estoque">
          <div class="stat"><span class="stat-label">Produtos cadastrados</span><strong class="stat-value">${ps.length}</strong><span class="stat-sub">${plural(state.cats.length, 'categoria', 'categorias')}</span></div>
          ${pode('verCusto') ? `<div class="stat"><span class="stat-label">Valor em estoque (custo)</span><strong class="stat-value">${cf.format(valor)}</strong><span class="stat-sub">${cf.format(venda)} a preço de venda</span></div>`
            : `<div class="stat"><span class="stat-label">Unidades em estoque</span><strong class="stat-value">${nf.format(ps.filter((p) => !ehKit(p)).reduce((s, p) => s + num(p.quantidade), 0))}</strong><span class="stat-sub">${cf.format(venda)} a preço de venda</span></div>`}
          <div class="stat"><span class="stat-label">Movimentações hoje</span><strong class="stat-value">${movsHoje.length}</strong><span class="stat-sub">${plural(ent, 'entrada', 'entradas')} e ${plural(sai, 'saída', 'saídas')}</span></div>
          <div class="stat ${alerta.length ? 'is-alert' : ''}"><span class="stat-label">Precisam de reposição</span><strong class="stat-value">${alerta.length}</strong><span class="stat-sub">${zerados ? `${zerados} sem nenhuma unidade` : `Abaixo do mínimo ou acabando em ${ALERTA_DIAS} dias`}</span></div>
        </section>

        <div class="dash-grid">
          <section class="panel">
            <header class="panel-head"><h2>Hora de pedir</h2>${alerta.length && recurso('compras') ? '<a class="link-btn" href="#/compras">Montar lista de compras</a>' : ''}</header>
            ${alerta.length ? `<ul class="restock">${alerta.slice(0, 8).map((p) => { const a = avaliar(p), forn = fornById(p.fornecedorId), pz = prazoDe(p.fornecedorId); return `
              <li class="${a.urgente ? 'is-urgente' : ''}">
                <div class="restock-info">
                  <span class="p-name">${esc(p.nome)}${a.urgente ? ' <span class="badge badge-zerado">Pedir já</span>' : ''}</span>
                  <span class="p-meta">${nf.format(num(p.quantidade))} ${esc(p.unidade)} em estoque, mínimo ${nf.format(num(p.estoqueMinimo))}</span>
                  <ul class="motivos">${a.motivos.map((m) => `<li class="motivo-${m.tipo}">${esc(m.texto)}</li>`).join('')}</ul>
                  <span class="p-meta forn-linha">${forn ? `${esc(forn.nome)}${pz.dias !== null ? `, entrega em ${textoPrazo(pz)}` : '. <a href="#/fornecedores">Informe o prazo de entrega</a>'}` : 'Sem fornecedor: <a href="#/produtos">ligue um no cadastro do produto</a>'}</span>
                  ${gauge(p)}
                </div>
                <div class="restock-acoes">
                  ${recurso('compras') && forn ? `<button class="btn btn-sm btn-primary" data-action="pedir-produto" data-id="${p.id}">Pedir</button>` : ''}
                  <button class="btn btn-sm" data-action="mov" data-tipo="entrada" data-id="${p.id}">${icon('entrada')}Entrada</button>
                </div>
              </li>`; }).join('')}</ul>${alerta.length > 8 ? `<p class="table-foot pad">E mais ${alerta.length - 8}. <a href="#/compras">Veja todos na lista de compras</a>.</p>` : ''}`
              : `<p class="panel-empty">Nada para pedir agora: todos os produtos estão acima do ponto de pedido e nenhum lote vai vencer sem vender.</p>`}
            ${cobertos.length ? `<p class="table-foot pad">${plural(cobertos.length, 'produto já tem pedido a caminho', 'produtos já têm pedido a caminho')} e não aparece${cobertos.length === 1 ? '' : 'm'} aqui.</p>` : ''}
          </section>

          <section class="panel">
            <header class="panel-head"><h2>Últimas movimentações</h2>${state.movs.length ? '<a class="link-btn" href="#/movimentacoes">Ver histórico</a>' : ''}</header>
            ${state.movs.length ? `<ul class="feed">${state.movs.slice(0, 9).map((m) => `
              <li>
                <span class="tipo tipo-${m.tipo}">${TIPOS[m.tipo]}</span>
                <span class="feed-name">${esc(m.produtoNome)}</span>
                <span class="feed-qtd q-${m.tipo}">${qtdSinal(m)}</span>
                <time class="feed-time">${quando(m.criadoEm)}</time>
              </li>`).join('')}</ul>`
              : `<p class="panel-empty">Nenhuma movimentação registrada ainda.</p>`}
          </section>
        </div>
        ${hook('painel')}`;
      }
    },

    /* ---------- Produtos ---------- */
    produtos: {
      actions: () => `
        ${botaoLer()}
        <button class="btn" data-action="exportar-produtos">${icon('exportar')}Exportar CSV</button>
        ${pode('estoque') ? `<button class="btn btn-primary" data-action="novo-produto">${icon('plus')}Novo produto</button>` : ''}`,
      shell: () => `
        <div class="toolbar">
          <label class="search">${icon('busca')}<input type="search" data-f="q" placeholder="Buscar por nome, código, código de barras ou local" value="${esc(state.f.q)}" aria-label="Buscar produtos"></label>
          <select data-f="cat" aria-label="Filtrar por categoria">
            <option value="">Todas as categorias</option>
            ${sortedCats().map((c) => `<option value="${c.id}" ${state.f.cat === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
            <option value="__none" ${state.f.cat === '__none' ? 'selected' : ''}>Sem categoria</option>
          </select>
          <select data-f="nivel" aria-label="Filtrar por nível de estoque">
            <option value="">Qualquer nível</option>
            <option value="alerta" ${state.f.nivel === 'alerta' ? 'selected' : ''}>Precisam de reposição</option>
            <option value="acabando" ${state.f.nivel === 'acabando' ? 'selected' : ''}>Acabam em até ${ALERTA_DIAS} dias</option>
            <option value="zerado" ${state.f.nivel === 'zerado' ? 'selected' : ''}>Sem estoque</option>
            <option value="ok" ${state.f.nivel === 'ok' ? 'selected' : ''}>Normal</option>
          </select>
        </div>
        <div id="view-body"></div>`,
      body() {
        if (!state.loaded.produtos) return loading();
        if (!state.produtos.length) {
          return emptyState('Nenhum produto cadastrado', 'Cada produto guarda código, local, preços e o estoque mínimo que dispara o alerta de reposição.',
            `<button class="btn btn-primary" data-action="novo-produto">${icon('plus')}Cadastrar produto</button>`);
        }
        const lista = produtosFiltrados();
        if (!lista.length) return `<p class="no-results">Nenhum produto corresponde aos filtros. <button class="link-btn" data-action="limpar-filtros">Limpar filtros</button></p>`;
        const total = lista.reduce((s, p) => s + num(p.quantidade) * num(p.custo), 0);
        const custoOk = pode('verCusto'), estq = pode('estoque'), gerir = pode('gerir');
        return `
        <div class="table-wrap">
          <table class="table">
            <thead><tr>
              <th>Produto</th><th>Categoria</th><th>Local</th><th class="col-stock">Estoque</th>
              ${custoOk ? '<th class="num">Custo</th>' : ''}<th class="num">Venda</th>${custoOk ? '<th class="num">Valor em estoque</th>' : ''}<th class="col-actions"><span class="sr-only">Ações</span></th>
            </tr></thead>
            <tbody>${lista.map((p) => `
              <tr class="row-${nivel(p)}">
                <td><span class="p-name">${esc(p.nome)}</span>${p.sku ? `<span class="p-sku">${esc(p.sku)}</span>` : ''}</td>
                <td>${esc(catName(p.categoriaId)) || '<span class="muted">Sem categoria</span>'}</td>
                <td>${esc(p.localizacao) || '<span class="muted">Não informado</span>'}</td>
                <td class="col-stock">
                  ${ehKit(p) ? `<div class="stock-cell"><strong>${nf.format(kitDisponivel(p))}</strong> <span class="muted">kits possíveis</span><span class="badge badge-kit">Kit</span>
                    ${nivel(p) !== 'ok' ? `<span class="badge badge-${nivel(p)}">${nivel(p) === 'zerado' ? 'Falta item' : 'Poucos kits'}</span>` : ''}</div>
                    <span class="min-note">${esc(itensKitTxt(p))}</span>` : `
                  <div class="stock-cell"><strong>${nf.format(num(p.quantidade))}</strong> <span class="muted">${esc(p.unidade)}</span>
                  ${nivel(p) !== 'ok' ? `<span class="badge badge-${nivel(p)}">${NIVEL_TXT[nivel(p)]}</span>` : acabaLogo(p) ? '<span class="badge badge-baixo">Acaba em breve</span>' : ''}</div>
                  ${gauge(p)}
                  <span class="min-note">Mínimo ${nf.format(num(p.estoqueMinimo))}${acabaEm(p) !== null && num(p.quantidade) > 0 ? `. Dura ${txtDias(acabaEm(p))}` : ''}</span>
                  ${hook('estoqueExtra', p)}`}
                </td>
                ${custoOk ? `<td class="num">${cf.format(ehKit(p) ? custoKit(p) : num(p.custo))}</td>` : ''}
                <td class="num">${cf.format(num(p.preco))}</td>
                ${custoOk ? `<td class="num">${ehKit(p) ? '<span class="muted">Nos itens</span>' : cf.format(num(p.quantidade) * num(p.custo))}</td>` : ''}
                <td class="col-actions"><div class="row-actions">
                  ${estq && !ehKit(p) ? `<button class="icon-btn i-in" data-action="mov" data-tipo="entrada" data-id="${p.id}" title="Registrar entrada" aria-label="Registrar entrada de ${esc(p.nome)}">${icon('entrada')}</button>` : ''}
                  <button class="icon-btn i-out" data-action="mov" data-tipo="saida" data-id="${p.id}" title="Registrar saída" aria-label="Registrar saída de ${esc(p.nome)}">${icon('saida')}</button>
                  ${estq && !ehKit(p) ? hook('acoesLinha', p) : ''}
                  ${estq ? `<button class="icon-btn" data-action="editar-produto" data-id="${p.id}" title="Editar" aria-label="Editar ${esc(p.nome)}">${icon('editar')}</button>` : ''}
                  ${gerir ? `<button class="icon-btn i-del" data-action="excluir-produto" data-id="${p.id}" title="Excluir" aria-label="Excluir ${esc(p.nome)}">${icon('excluir')}</button>` : ''}
                </div></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="table-foot">${lista.length} de ${state.produtos.length} produtos exibidos${custoOk ? `, somando ${cf.format(total)} a preço de custo` : ''}.</p>`;
      }
    },

    /* ---------- Movimentações ---------- */
    movimentacoes: {
      actions: () => `
        ${botaoLer()}
        <button class="btn" data-action="exportar-movs">${icon('exportar')}Exportar CSV</button>
        <button class="btn btn-primary" data-action="nova-mov">${icon('plus')}Registrar movimentação</button>`,
      shell: () => `
        <div class="toolbar">
          <label class="search">${icon('busca')}<input type="search" data-f="mq" placeholder="Buscar por produto, código ou observação" value="${esc(state.f.mq)}" aria-label="Buscar movimentações"></label>
          <select data-f="tipo" aria-label="Filtrar por tipo">
            <option value="">Todos os tipos</option>
            ${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${state.f.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
          <label class="date-f"><span>De</span><input type="date" data-f="de" value="${esc(state.f.de)}"></label>
          <label class="date-f"><span>Até</span><input type="date" data-f="ate" value="${esc(state.f.ate)}"></label>
        </div>
        <div id="view-body"></div>`,
      body() {
        if (!state.loaded.movimentacoes) return loading();
        if (!state.movs.length) {
          return emptyState('Nenhuma movimentação ainda', 'Registre entradas de mercadoria, saídas e ajustes de inventário. Cada uma atualiza o estoque na hora e fica no histórico.',
            `<button class="btn btn-primary" data-action="nova-mov">${icon('plus')}Registrar movimentação</button>`);
        }
        const lista = movsFiltradas();
        if (!lista.length) return `<p class="no-results">Nenhuma movimentação corresponde aos filtros. <button class="link-btn" data-action="limpar-filtros">Limpar filtros</button></p>`;
        return `
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th class="num">Quantidade</th><th class="num">Saldo</th><th>Responsável</th><th>Observação</th></tr></thead>
            <tbody>${lista.map((m) => `
              <tr>
                <td class="nowrap">${m.criadoEm ? df.format(m.criadoEm) : ''}</td>
                <td><span class="p-name">${esc(m.produtoNome)}</span>${m.sku ? `<span class="p-sku">${esc(m.sku)}</span>` : ''}</td>
                <td><span class="tipo tipo-${m.tipo}">${TIPOS[m.tipo] || esc(m.tipo)}</span></td>
                <td class="num q-${m.tipo}"><strong>${qtdSinal(m)}</strong></td>
                <td class="num nowrap">${m.tipo === 'transferencia' ? `<span class="muted">total</span> ${nf.format(num(m.depois))}` : `${nf.format(num(m.antes))} <span class="muted">para</span> ${nf.format(num(m.depois))}`}</td>
                <td>${esc(nomeDe(m.usuario))}</td>
                <td class="obs">${esc(m.observacao) || (m.tipo === 'transferencia' || m.lotes || m.localNome ? '' : '<span class="muted">Sem observação</span>')}${detalheMov(m)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="table-foot">${plural(lista.length, 'movimentação exibida', 'movimentações exibidas')}.</p>`;
      }
    },

    /* ---------- Categorias ---------- */
    categorias: {
      actions: () => '',
      shell: () => `
        <form id="f-cat" class="inline-form" novalidate>
          <label class="field grow"><span>Nova categoria</span><input name="nome" maxlength="60" placeholder="Ex.: Bebidas, Ferramentas, Embalagens" autocomplete="off"></label>
          <button class="btn btn-primary" type="submit">${icon('plus')}Adicionar categoria</button>
        </form>
        <div id="view-body"></div>`,
      body() {
        if (!state.loaded.categorias) return loading();
        if (!state.cats.length) return `<p class="panel-empty">Nenhuma categoria criada. Categorias ajudam a filtrar a lista de produtos.</p>`;
        return `<ul class="cat-list">${sortedCats().map((c) => {
          const n = state.produtos.filter((p) => p.categoriaId === c.id).length;
          return `<li>
            <span class="cat-name">${esc(c.nome)}</span>
            <span class="muted">${plural(n, 'produto', 'produtos')}</span>
            <div class="row-actions">
              <button class="icon-btn" data-action="renomear-cat" data-id="${c.id}" title="Renomear" aria-label="Renomear ${esc(c.nome)}">${icon('editar')}</button>
              <button class="icon-btn i-del" data-action="excluir-cat" data-id="${c.id}" title="Excluir" aria-label="Excluir ${esc(c.nome)}">${icon('excluir')}</button>
            </div>
          </li>`;
        }).join('')}</ul>`;
      }
    },

    /* ---------- Fornecedores ---------- */
    fornecedores: {
      actions: () => `<button class="btn btn-primary" data-action="novo-fornecedor">${icon('plus')}Novo fornecedor</button>`,
      shell: () => `<div id="view-body"></div>`,
      body() {
        if (!state.loaded.fornecedores) return loading();
        if (!state.fornecedores.length) {
          return emptyState('Nenhum fornecedor cadastrado', 'Ligue cada produto a um fornecedor para a lista de compras sair separada por fornecedor, pronta para enviar pelo WhatsApp.',
            `<button class="btn btn-primary" data-action="novo-fornecedor">${icon('plus')}Cadastrar fornecedor</button>`);
        }
        return `
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Fornecedor</th><th>Prazo de entrega</th><th>Para pedir</th><th>WhatsApp</th><th>CNPJ</th><th class="num">Produtos</th><th class="col-actions"><span class="sr-only">Ações</span></th></tr></thead>
            <tbody>${sortedForn().map((f) => {
              const n = state.produtos.filter((p) => p.fornecedorId === f.id).length;
              const pz = prazoDe(f.id);
              const pedir = state.produtos.filter((p) => p.fornecedorId === f.id && avaliar(p).pedir);
              return `<tr>
                <td><span class="p-name">${esc(f.nome)}</span>${f.contato ? `<span class="p-sku">${esc(f.contato)}</span>` : ''}</td>
                <td>${pz.dias === null ? '<span class="muted">Não informado</span>' : `<strong>${textoPrazo(pz)}</strong><span class="p-sku">${pz.origem === 'real' ? `média de ${plural(pz.entregas, 'entrega', 'entregas')}${pz.min !== pz.max ? `, de ${pz.min} a ${pz.max} dias` : ''}` : 'informado por você'}</span>`}</td>
                <td class="nowrap">${pedir.length ? `<a class="chip ${pedir.some((p) => avaliar(p).urgente) ? 'st-erro' : 'st-atualizar'}" href="#/compras">${pedir.length} para pedir</a>` : '<span class="muted">Nada agora</span>'}</td>
                <td class="nowrap">${esc(fmtFone(f.telefone)) || '<span class="muted">Não informado</span>'}</td>
                <td class="nowrap">${esc(fmtCnpj(f.cnpj)) || '<span class="muted">Não informado</span>'}</td>
                <td class="num">${n}</td>
                <td class="col-actions"><div class="row-actions">
                  ${f.telefone ? `<a class="icon-btn i-in" href="https://wa.me/${waNumero(f.telefone)}" target="_blank" rel="noopener" title="Abrir conversa no WhatsApp" aria-label="WhatsApp de ${esc(f.nome)}">${icon('whatsapp')}</a>` : ''}
                  <button class="icon-btn" data-action="editar-fornecedor" data-id="${f.id}" title="Editar" aria-label="Editar ${esc(f.nome)}">${icon('editar')}</button>
                  <button class="icon-btn i-del" data-action="excluir-fornecedor" data-id="${f.id}" title="Excluir" aria-label="Excluir ${esc(f.nome)}">${icon('excluir')}</button>
                </div></td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>`;
      }
    },

    /* ---------- Lista de compras ---------- */
    compras: {
      actions: () => `<button class="btn" data-action="exportar-compras">${icon('exportar')}Exportar CSV</button>`,
      shell: () => `
        <div class="toolbar">
          <label class="date-f"><span>Incluir o que acaba em até</span><select data-cp="incluirDias">
            ${[7, 14, 30].map((d) => `<option value="${d}" ${state.compra.incluirDias === d ? 'selected' : ''}>${d} dias</option>`).join('')}</select></label>
          <label class="date-f"><span>Comprar para</span><select data-cp="cobertura">
            ${[15, 30, 45, 60, 90].map((d) => `<option value="${d}" ${state.compra.cobertura === d ? 'selected' : ''}>${d} dias de consumo</option>`).join('')}</select></label>
        </div>
        <div id="view-body"></div>`,
      body() {
        if (!state.loaded.produtos || !state.loaded.movimentacoes) return loading();
        const grupos = gruposCompra();
        if (!grupos.length) {
          return emptyState('Nada para comprar agora', `Nenhum produto está abaixo do mínimo nem deve acabar nos próximos ${state.compra.incluirDias} dias.`, '');
        }
        const totalGeral = grupos.reduce((s, g) => s + totalGrupo(g), 0);
        return `
        ${grupos.map((g) => `
        <section class="panel compra-grupo" data-grupo="${g.id}">
          <header class="panel-head">
            <div class="grupo-tit"><h2>${esc(g.nome)}</h2><span class="p-meta">${g.forn ? [g.forn.contato, fmtFone(g.forn.telefone)].filter(Boolean).map(esc).join(', ') || 'Sem contato cadastrado' : 'Ligue estes produtos a um fornecedor no cadastro do produto'}</span>${g.forn ? `<span class="p-meta prazo-linha">${g.prazo.dias !== null ? `Entrega em ${textoPrazo(g.prazo)}${g.prazo.origem === 'real' ? ` (média de ${plural(g.prazo.entregas, 'entrega', 'entregas')})` : ' (informado)'}` : '<a href="#/fornecedores">Informe o prazo de entrega deste fornecedor</a> para os avisos ficarem mais precisos'}</span>` : ''}</div>
            <div class="grupo-acoes">
              <button class="btn btn-sm" data-action="criar-pedido-compra" data-grupo="${g.id}">${icon('plus')}Criar pedido</button>
              <button class="btn btn-sm" data-action="copiar-pedido" data-grupo="${g.id}">${icon('copiar')}Copiar</button>
              ${g.forn && g.forn.telefone ? `<button class="btn btn-sm btn-primary" data-action="whatsapp-pedido" data-grupo="${g.id}">${icon('whatsapp')}Enviar pelo WhatsApp</button>` : ''}
            </div>
          </header>
          <div class="table-wrap flat">
            <table class="table compra-table">
              <thead><tr><th class="col-check"><span class="sr-only">Incluir</span></th><th>Produto</th><th class="num">Estoque</th><th class="num">Consumo</th><th>Acaba em</th><th class="num">Comprar</th>${pode('verCusto') ? '<th class="num">Custo estimado</th>' : ''}</tr></thead>
              <tbody>${g.itens.map((i) => `
                <tr class="${i.inc ? '' : 'is-off'}" data-linha="${i.p.id}">
                  <td class="col-check"><input type="checkbox" data-cp-inc="${i.p.id}" ${i.inc ? 'checked' : ''} aria-label="Incluir ${esc(i.p.nome)} no pedido"></td>
                  <td><span class="p-name">${esc(i.p.nome)}${i.aval.urgente ? ' <span class="badge badge-zerado">Pedir já</span>' : ''}</span>${i.p.sku ? `<span class="p-sku">${esc(i.p.sku)}</span>` : ''}${i.aval.motivos.length ? `<ul class="motivos">${i.aval.motivos.map((m) => `<li class="motivo-${m.tipo}">${esc(m.texto)}</li>`).join('')}</ul>` : ''}</td>
                  <td class="num"><strong>${nf.format(num(i.p.quantidade))}</strong> <span class="muted">${esc(i.p.unidade)}</span><span class="p-sku">mínimo ${nf.format(num(i.p.estoqueMinimo))}</span>${i.caminho ? `<span class="p-sku caminho">${nf.format(i.caminho)} a caminho</span>` : ''}</td>
                  <td class="num">${i.media > 0 ? `${nf1.format(i.media)} <span class="muted">por dia</span>` : '<span class="muted">Sem saídas</span>'}</td>
                  <td class="nowrap">${num(i.p.quantidade) <= 0 ? '<span class="badge badge-zerado">Já acabou</span>' : i.acaba !== null ? `<span class="${i.acaba <= ALERTA_DIAS ? 'forecast-hot' : ''}">${txtDias(i.acaba)}</span>` : '<span class="muted">Sem previsão</span>'}</td>
                  <td class="num nowrap"><input type="number" class="qtd-input" min="0" step="any" inputmode="decimal" data-cp-qtd="${i.p.id}" value="${i.qtd}" aria-label="Quantidade a comprar de ${esc(i.p.nome)}"> <span class="muted">${esc(i.p.unidade)}</span></td>
                  ${pode('verCusto') ? `<td class="num" data-cp-custo="${i.p.id}">${num(i.p.custo) ? cf.format(i.qtd * num(i.p.custo)) : '<span class="muted">Sem custo</span>'}</td>` : ''}
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
          ${pode('verCusto') ? `<footer class="compra-total">Total estimado deste pedido: <strong data-cp-total="${g.id}">${cf.format(totalGrupo(g))}</strong></footer>` : ''}
        </section>`).join('')}
        <p class="table-foot">${pode('verCusto') ? `Total estimado de todos os pedidos: <strong id="cp-total-geral">${cf.format(totalGeral)}</strong>. ` : ''}O que já está a caminho em pedidos abertos é descontado da sugestão. O consumo é a média das saídas dos últimos ${Prev.JANELA} dias. A quantidade sugerida cobre ${state.compra.cobertura} dias de consumo e deixa o estoque em pelo menos o dobro do mínimo. Dá para mudar qualquer quantidade antes de enviar.</p>`;
      }
    },

    /* ---------- Importar ---------- */
    importar: {
      actions: () => '',
      shell: () => {
        if (!recurso('importacao')) state.imp.aba = 'nfe';
        else if (!recurso('nfe') && !planoQueLibera('nfe')) state.imp.aba = 'planilha';
        const nfeBloqueada = state.imp.aba === 'nfe' && !recurso('nfe');
        return `
        <div class="tabs" role="tablist" aria-label="Tipo de importação">
          ${recurso('importacao') ? `<button role="tab" data-action="imp-aba" data-aba="planilha" aria-selected="${state.imp.aba === 'planilha'}">${icon('produtos')}Planilha de produtos</button>` : ''}
          ${recurso('nfe') || planoQueLibera('nfe') ? `<button role="tab" data-action="imp-aba" data-aba="nfe" aria-selected="${state.imp.aba === 'nfe'}">${icon(recurso('nfe') ? 'entrada' : 'cadeado')}Nota fiscal (XML)</button>` : ''}
        </div>
        ${state.imp.aba === 'planilha' ? shellPlanilha() : nfeBloqueada
          ? cardBloqueado(planoQueLibera('nfe'), 'Entrada pela nota fiscal', 'Envie o XML da NF-e de compra e o Estokio lança todas as entradas de uma vez, com custo atualizado e fornecedor reconhecido pelo CNPJ.')
          : shellNFe()}
        <div id="view-body"></div>`;
      },
      body: () => (state.imp.aba === 'planilha' ? corpoPlanilha() : recurso('nfe') ? corpoNFe() : ''),
      mount: () => {
        $$('#view .dropzone').forEach((dz) => {
          dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-over'); });
          dz.addEventListener('dragleave', () => dz.classList.remove('is-over'));
          dz.addEventListener('drop', (e) => {
            e.preventDefault(); dz.classList.remove('is-over');
            const f = e.dataTransfer.files[0];
            if (f) (state.imp.aba === 'planilha' ? receberPlanilha : receberXML)(f);
          });
        });
      }
    },

    /* ---------- Equipe (responsável) ---------- */
    equipe: {
      actions: () => '',
      shell: () => `<div id="view-body"></div>`,
      body() {
        if (!state.loaded.membros) return loading();
        const max = maxUsuarios();
        const membros = state.membros.slice().sort((a, b) => (a.papel === 'dono' ? -1 : b.papel === 'dono' ? 1 : (a.entrouEm || 0) - (b.entrouEm || 0)));
        const total = membros.length;
        const pend = convitesValidos();
        const expirados = state.convites.filter((c) => c.status === 'pendente' && c.validoAte && c.validoAte <= Date.now());
        const livres = Math.max(0, max - total - pend.length);
        const slots = Array.from({ length: max }, (_, i) => (i < total ? 'on' : i < total + pend.length ? 'pend' : ''));

        return `
        <section class="team-head">
          <div class="slots" aria-hidden="true">${slots.map((s) => `<span class="slot ${s}"></span>`).join('')}</div>
          <div class="team-count">
            <strong>${total} de ${max} usuários</strong>
            <span class="muted">${pend.length ? `${plural(pend.length, 'convite aguardando', 'convites aguardando')}, ` : ''}${plural(livres, 'vaga livre', 'vagas livres')}</span>
          </div>
          <button class="btn btn-primary" data-action="novo-convite" ${livres ? '' : 'disabled title="Todas as vagas estão ocupadas ou reservadas por convites"'}>${icon('plus')}Convidar pessoa</button>
          ${!livres && !emTeste() && maisVagas() ? `<button class="btn" data-action="escolher-plano" data-plano="${maisVagas().id}">Subir para o ${esc(maisVagas().nome)}: ${maisVagas().maxUsuarios} usuários</button>` : ''}
        </section>

        <section class="panel">
          <header class="panel-head"><h2>Pessoas com acesso</h2></header>
          ${ehDono() ? `<p class="papeis-ajuda">${['gerente', 'estoquista', 'caixa'].map((k) => `<span><strong>${PAPEIS[k]}:</strong> ${PAPEIS_DESC[k]}</span>`).join('')}</p>` : ''}
          <ul class="people">${membros.map((m) => `
            <li>
              <span class="avatar" aria-hidden="true">${esc(Marca.iniciais(m.nome || m.email))}</span>
              <div class="people-info"><span class="p-name">${esc(m.nome || m.email)}</span><span class="p-meta">${esc(m.email)}</span></div>
              ${m.papel === 'dono' || !ehDono() ? `<span class="role ${m.papel === 'dono' ? 'role-dono' : ''}">${PAPEIS[normPapel(m.papel)]}</span>`
                : `<select class="papel-sel" data-papel-de="${m.id}" aria-label="Papel de ${esc(m.nome || m.email)}">${['gerente', 'estoquista', 'caixa'].map((k) => `<option value="${k}" ${normPapel(m.papel) === k ? 'selected' : ''}>${PAPEIS[k]}</option>`).join('')}</select>`}
              <span class="p-meta people-date">${m.entrouEm ? `Desde ${dfd.format(m.entrouEm)}` : ''}</span>
              ${m.papel === 'dono' ? '<span class="icon-btn-spacer"></span>' : `<button class="icon-btn i-del" data-action="remover-membro" data-id="${m.id}" title="Remover acesso" aria-label="Remover acesso de ${esc(m.nome || m.email)}">${icon('excluir')}</button>`}
            </li>`).join('')}
          </ul>
        </section>

        ${pend.length || expirados.length ? `
        <section class="panel">
          <header class="panel-head"><h2>Convites aguardando</h2></header>
          <ul class="invites">${pend.concat(expirados).map((c) => {
            const exp = c.validoAte && c.validoAte <= Date.now();
            return `
            <li class="${exp ? 'is-exp' : ''}">
              <span class="code-chip">${esc(c.id)}</span>
              <span class="p-meta">${exp ? 'Expirado' : `Vale até ${dfd.format(c.validoAte)}`}</span>
              <div class="row-actions">
                ${exp ? '' : `<button class="icon-btn" data-action="copiar-convite" data-id="${esc(c.id)}" title="Copiar mensagem de convite" aria-label="Copiar mensagem de convite">${icon('copiar')}</button>
                <a class="icon-btn" href="${waLink(c.id)}" target="_blank" rel="noopener" title="Enviar pelo WhatsApp" aria-label="Enviar pelo WhatsApp">${icon('mensagem')}</a>`}
                <button class="icon-btn i-del" data-action="cancelar-convite" data-id="${esc(c.id)}" title="Cancelar convite" aria-label="Cancelar convite">${icon('excluir')}</button>
              </div>
            </li>`;
          }).join('')}</ul>
        </section>` : ''}

        <p class="table-foot">Quem é da equipe cadastra produtos e registra movimentações. Só o responsável exclui produtos, convida pessoas e muda a aparência do sistema.</p>`;
      }
    },

    /* ---------- Empresa (responsável) ---------- */
    empresa: {
      actions: () => '',
      shell: () => `
        <section class="panel validade-panel">
          <header class="panel-head"><h2>Plano e validade</h2></header>
          <div class="validade-body">
            <div id="view-body"></div>
            ${DB.apresentacao ? '' : '<details class="codigo-det"><summary>Tenho um código de renovação</summary><div id="renovar-area" class="renovar-area"></div></details>'}
          </div>
        </section>
        ${empresaFormHTML(state.empresa, 'config')}
        ${DB.apresentacao ? '' : `<section class="panel lgpd-panel">
          <header class="panel-head"><h2>Central de Privacidade</h2></header>
          <div id="lgpd-body" class="imp-text stack">${lgpdBodyHTML()}</div>
        </section>`}`,
      body() {
        const emp = state.empresa;
        if (DB.apresentacao) {
          const menor = planosVenda()[0];
          return `<div class="plano-info"><div><span class="muted">Plano</span> <strong>Demonstração, com todos os recursos liberados</strong></div></div>
            <p class="muted apres-plano">Na sua conta, você começa com 7 dias grátis com tudo liberado e depois escolhe entre Básico, Pro e Premium${menor ? `, a partir de ${cf.format(Ass.preco(menor, 'mensal'))} por mês` : ''}, pagando por Pix.</p>
            <div class="grupo-acoes plano-acoes"><a class="btn btn-primary" href="${urlCadastro()}">Criar minha conta grátis</a></div>`;
        }
        const d = diasRestantes(emp);
        const alerta = d !== null && d <= Ass.diasAviso(emp.planoDias);
        const per = Ass.periodoPorDias(emp.planoDias);
        const pend = state.pedidos[0];
        const maxP = num(emp.maxProdutos);
        const recursosChips = ['nfe', 'lotes', 'grade', 'kits', 'etiquetas', 'relatorios', 'multiloja'].map((k) => {
          if (recurso(k)) return `<span class="rc rc-on">${icon('ok')}${NOME_CURTO[k]}</span>`;
          const pl = planoQueLibera(k);
          return `<span class="rc rc-off">${icon('cadeado')}${NOME_CURTO[k]}${pl ? `<small>${esc(pl.nome)}</small>` : ''}</span>`;
        }).join('');
        return `
          <div class="validade-info ${alerta ? 'is-warn' : ''}">
            <span class="muted">${emp.acessoAte ? (emTeste() ? 'Teste grátis até' : 'Acesso liberado até') : 'Acesso'}</span>
            <strong>${emp.acessoAte ? dfd.format(emp.acessoAte) : 'Sem vencimento'}</strong>
            ${emp.acessoAte ? `<span class="${alerta ? 'validade-alerta' : 'muted'}">${d > 0 ? `Faltam ${plural(d, 'dia', 'dias')}` : 'Venceu'}</span>` : ''}
          </div>
          <div class="plano-info">
            <div><span class="muted">Plano</span> <strong>${esc(emp.planoNome) || 'Sem plano'}${per && !emTeste() ? `, ${per.nome.toLowerCase()}` : ''}</strong></div>
            <div><span class="muted">Usuários</span> <strong>até ${num(emp.maxUsuarios) || DB.MAX_USUARIOS}</strong></div>
            <div><span class="muted">Produtos</span> <strong>${maxP ? `até ${nf.format(maxP)}` : 'ilimitados'}</strong></div>
          </div>
          <div class="rec-chips" aria-label="Recursos do plano">${recursosChips}</div>
          ${planoLegado() ? `<p class="aviso-legado">Seu plano atual (${esc(emp.planoNome)}) não é mais vendido, mas continua valendo até ${emp.acessoAte ? dfd.format(emp.acessoAte) : 'o fim do período'}. Na renovação, você escolhe entre Básico, Pro e Premium.</p>` : ''}
          ${pend ? `<div class="pedido-pend">${icon('pix')}<span>Pagamento de <strong>${cf.format(pend.valor)}</strong> aguardando confirmação.</span><button class="link-btn" data-action="escolher-plano">Ver Pix</button></div>` : ''}
          <div class="grupo-acoes plano-acoes">
            <button class="btn btn-primary" data-action="escolher-plano">${emTeste() ? 'Escolher plano' : 'Renovar ou mudar de plano'}</button>
          </div>`;
      },
      mount: () => {
        montarEmpresaForm($('#view #f-emp'), state.empresa, 'config');
        if ($('#renovar-area')) formRenovacao($('#renovar-area'));
        if (!DB.apresentacao && state.aceiteInfo === undefined) {
          state.aceiteInfo = null; // evita buscar de novo enquanto a resposta não chega
          DB.lerAceite(state.user.uid).then((info) => { state.aceiteInfo = info || false; if ($('#lgpd-body')) $('#lgpd-body').innerHTML = lgpdBodyHTML(); });
        }
      }
    }
  };

  function nomeDe(email) {
    const m = state.membros.find((x) => x.email === email);
    return (m && m.nome) || email;
  }

  function mensagemConvite(codigo) {
    const url = urlApp();
    return `Você foi convidado para a equipe de ${state.empresa.nome} no Estokio.\n\n` +
      `1. Acesse ${url ? `${url.replace(/\/+$/, '')}/?codigo=${codigo}` : 'o Estokio'}\n2. Crie sua conta (o código já vem preenchido pelo link)\n3. Se pedir, use o código ${codigo}\n\nO código vale por 7 dias e só pode ser usado uma vez.`;
  }
  const waLink = (codigo) => `https://wa.me/?text=${encodeURIComponent(mensagemConvite(codigo))}`;

  /** Local e lotes de uma movimentação, em texto curto. */
  function detalheMov(m) {
    const partes = [];
    if (m.tipo === 'transferencia') partes.push(`De ${esc(m.deNome || 'origem')} para ${esc(m.paraNome || 'destino')}`);
    else if (m.localNome) partes.push(`Em ${esc(m.localNome)}`);
    if (Array.isArray(m.lotes) && m.lotes.length) partes.push(m.lotes.map((l) => `lote ${esc(l.lote)}${l.validade ? ` (vence ${dfd.format(l.validade)})` : ''}: ${nf.format(num(l.quantidade))}`).join('; '));
    return partes.length ? `<span class="p-sku mov-det">${partes.join('. ')}</span>` : '';
  }

  function produtosFiltrados() {
    const { q, cat, nivel: nv } = state.f;
    const qq = norm(q);
    return sortedProds().filter((p) =>
      (!qq || norm(`${p.nome} ${p.sku} ${p.codigoBarras} ${p.localizacao}`).includes(qq) || (p.codigoBarras && semZeros(p.codigoBarras) === semZeros(q.trim()))) &&
      (!cat || (cat === '__none' ? !catName(p.categoriaId) : p.categoriaId === cat)) &&
      (!nv || (nv === 'alerta' ? precisaRepor(p) : nv === 'acabando' ? acabaLogo(p) : nivel(p) === nv))
    );
  }

  function movsFiltradas() {
    const { mq, tipo, de, ate } = state.f;
    const qq = norm(mq);
    const ini = de ? new Date(de + 'T00:00:00').getTime() : -Infinity;
    const fim = ate ? new Date(ate + 'T23:59:59.999').getTime() : Infinity;
    return state.movs.filter((m) =>
      (!qq || norm(`${m.produtoNome} ${m.sku} ${m.observacao}`).includes(qq)) &&
      (!tipo || m.tipo === tipo) &&
      (m.criadoEm >= ini && m.criadoEm <= fim)
    );
  }

  /* ================= render ================= */
  function render() {
    if (state.tela !== 'shell') return;
    const rotaInfo = ROUTES[state.route];
    const bloqueada = rotaInfo.recurso && !recurso(rotaInfo.recurso);
    const v = bloqueada
      ? { actions: () => '', shell: () => cardBloqueado(planoQueLibera(rotaInfo.recurso), rotaInfo.titulo, rotaInfo.vitrine || '') + '<div id="view-body"></div>', body: () => '' }
      : views[state.route];
    const titulo = rotaInfo.titulo;
    $('#page-title').textContent = titulo;
    document.title = `${titulo} | ${state.empresa ? state.empresa.nome : 'Estokio'}`;
    renderAbas();
    $('#page-actions').innerHTML = v.actions();
    $('#view').innerHTML = v.shell();
    if (v.mount) v.mount();
    refresh();
  }

  function refresh() {
    if (state.tela !== 'shell') return;
    const body = $('#view-body');
    const rotaInfo = ROUTES[state.route];
    if (rotaInfo.recurso && !recurso(rotaInfo.recurso)) return;
    if (body) body.innerHTML = views[state.route].body();
    // A Central de Privacidade fica em shell(), fora de #view-body: refresh() não a alcançaria sem isto
    const lgpd = $('#lgpd-body');
    if (lgpd) lgpd.innerHTML = lgpdBodyHTML();
  }

  function atualizarAviso() {
    let el = $('#aviso-validade');
    if (!el) {
      el = document.createElement('div');
      el.id = 'aviso-validade';
      el.className = 'validade-banner';
      $('.main').insertBefore(el, $('.topbar'));
    }
    const emp = state.empresa;
    const d = diasRestantes(emp);
    if (d === null || d > Ass.diasAviso(emp.planoDias)) { el.hidden = true; return; }
    el.hidden = false;
    const teste = emTeste();
    const prazo = d <= 1 ? `${teste ? 'termina' : 'vence'} em ${df.format(emp.acessoAte)}` : `${teste ? 'termina' : 'vence'} em ${plural(d, 'dia', 'dias')}, no dia ${dfd.format(emp.acessoAte)}`;
    const frase = teste ? `Seu teste grátis ${prazo}.` : `O acesso ao Estokio ${prazo}.`;
    el.classList.toggle('is-teste', teste);
    el.innerHTML = ehDono()
      ? `${frase} <button class="link-btn" data-action="escolher-plano">${teste ? 'Escolher plano' : 'Renovar agora'}</button>`
      : `${frase} Avise o responsável pela empresa.`;
  }

  /** Como uma tela aparece para esta pessoa e este plano: escondida, liberada ou bloqueada (com cadeado, quando algum plano a traz). */
  function estadoDaRota(r) {
    const info = ROUTES[r];
    if (!info) return { visivel: false };
    if (info.dono && !ehDono()) return { visivel: false };
    if (info.perm && !pode(info.perm)) return { visivel: false };
    if (info.recurso && !recurso(info.recurso)) {
      const pl = info.vitrine !== undefined ? planoQueLibera(info.recurso) : null;
      return pl ? { visivel: true, bloqueada: true, plano: pl } : { visivel: false };
    }
    return { visivel: true, bloqueada: false };
  }

  /** Atualiza o menu (um item por grupo) e a barra de abas do grupo em que a pessoa está. */
  function renderAbas() {
    const nav = $('#abas-grupo');
    const atual = grupoDaRota(state.route);
    GRUPOS.forEach((g) => {
      const abas = g.rotas.map((r) => ({ r, ...estadoDaRota(r) })).filter((a) => a.visivel);
      const link = $(`.nav [data-grupo="${g.id}"]`);
      if (link) {
        link.hidden = !abas.length;
        if (abas.length) link.setAttribute('href', `#/${(abas.find((a) => !a.bloqueada) || abas[0]).r}`);
        link.classList.toggle('active', atual === g);
        if (atual === g) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
      }
      if (atual === g && nav) {
        nav.hidden = abas.length < 2;
        nav.setAttribute('aria-label', `Seções de ${g.nome}`);
        nav.innerHTML = abas.length < 2 ? '' : abas.map((a) => `<a href="#/${a.r}" class="${a.r === state.route ? 'active' : ''} ${a.bloqueada ? 'is-lock' : ''}" ${a.r === state.route ? 'aria-current="page"' : ''} ${a.bloqueada ? `title="Disponível a partir do plano ${esc(a.plano.nome)}"` : ''}>${esc(NOME_ABA[a.r] || ROUTES[a.r].titulo)}${a.bloqueada ? icon('cadeado') : ''}${a.r === 'compras' ? '<span class="nav-badge aba-badge" hidden></span>' : ''}</a>`).join('');
        const ativa = nav.querySelector('.active');
        if (ativa) nav.scrollLeft = Math.max(0, ativa.offsetLeft - 16);
      }
    });
    atualizarBadgeCompras();
  }

  /** Faixa para o responsável quando as regras do Firebase estão numa versão antiga (o app novo grava onde a regra antiga não deixa). */
  function atualizarAvisoRegras() {
    let el = $('#aviso-regras');
    if (!el) {
      el = document.createElement('div');
      el.id = 'aviso-regras'; el.className = 'validade-banner';
      $('.main').insertBefore(el, $('.topbar'));
    }
    el.hidden = !(state.regrasAntigas && ehDono());
    el.innerHTML = 'As regras de segurança do Firebase estão desatualizadas, e algumas telas podem responder "sem permissão" (importar planilha, custos, compras). Publique o arquivo <code>firestore.rules</code> do projeto: <code>npm run deploy:regras</code>.';
  }

  function atualizarLateral() {
    atualizarBadgeCompras();
    const emp = state.empresa;
    $('#side-brand').innerHTML = `<span class="side-mark">${logoHTML(emp, 'side')}</span><span class="side-name">${esc(emp.nome)}</span>`;
    $('#side-brand').title = emp.nome;
    renderAbas();
    let selo = $('#side-teste');
    if (!selo) { selo = document.createElement('button'); selo.id = 'side-teste'; selo.className = 'side-teste'; selo.dataset.action = 'escolher-plano'; $('.sidebar').insertBefore(selo, $('.side-user')); }
    const dT = diasRestantes(emp);
    selo.hidden = !emTeste();
    if (emTeste()) {
      selo.disabled = !ehDono();
      selo.innerHTML = `<strong>Teste grátis</strong><span>${dT > 0 ? `faltam ${plural(dT, 'dia', 'dias')}` : 'terminou'}</span>${ehDono() ? '<em>Escolher plano</em>' : ''}`;
    }
    if (ROUTES[state.route] && ROUTES[state.route].recurso && !recurso(ROUTES[state.route].recurso) && !planoQueLibera(ROUTES[state.route].recurso) && state.tela === 'shell') location.hash = '#/painel';
    const me = state.membros.find((m) => m.id === state.user.uid);
    $('#user-name').textContent = (me && me.nome) || state.user.name || state.user.email;
    $('#user-email').textContent = DB.mode === 'local' ? 'Dados neste navegador' : `${PAPEIS[meuPapel()]}, ${state.user.email}`;
  }

  $('#view').addEventListener('input', (e) => {
    const k = e.target.dataset.f;
    if (!k) return;
    state.f[k] = e.target.value;
    refresh();
  });

  $('#view').addEventListener('submit', async (e) => {
    if (e.target.id !== 'f-cat') return;
    e.preventDefault();
    const input = e.target.nome;
    const nome = input.value.trim();
    if (!nome) { input.focus(); return toast('Digite o nome da categoria.', 'erro'); }
    if (state.cats.some((c) => norm(c.nome) === norm(nome))) return toast('Já existe uma categoria com esse nome.', 'erro');
    const btn = e.target.querySelector('button[type=submit]');
    setBusy(btn, true, 'Adicionando…');
    try { await DB.saveCategory({ nome }); input.value = ''; toast('Categoria adicionada.'); }
    catch (err) { toast(msgErro(err), 'erro'); }
    finally { setBusy(btn, false); input.focus(); }
  });

  function route() {
    const r = (location.hash.replace(/^#\/?/, '') || 'painel').split('?')[0];
    let alvo = ROUTES[r] ? r : 'painel';
    if (ROUTES[alvo].dono && !ehDono()) alvo = 'painel';
    if (ROUTES[alvo].perm && !pode(ROUTES[alvo].perm)) alvo = 'painel';
    if (ROUTES[alvo].recurso && !recurso(ROUTES[alvo].recurso) && !planoQueLibera(ROUTES[alvo].recurso)) alvo = 'painel';
    state.route = alvo;
    if (DB.apresentacao && ['compras', 'validades', 'relatorios', 'grades', 'empresa'].includes(alvo)) marcarTour(alvo);
    render();
  }
  window.addEventListener('hashchange', route);

  /* ================= ações ================= */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const { action, id } = t.dataset;
    switch (action) {
      case 'close-modal': closeModal(); break;
      case 'novo-produto': productForm(); break;
      case 'editar-produto': productForm(prodById(id)); break;
      case 'excluir-produto': excluirProduto(id); break;
      case 'pedir-exclusao': modalPedirExclusao(); break;
      case 'cancelar-exclusao': cancelarPedidoExclusao(t); break;
      case 'aprovar-ajuste': resolverAjuste(id, true, t); break;
      case 'recusar-ajuste': resolverAjuste(id, false, t); break;
      case 'mov': movementForm({ produtoId: id, tipo: t.dataset.tipo }); break;
      case 'nova-mov': movementForm({}); break;
      case 'exportar-produtos': exportarProdutos(); break;
      case 'exportar-movs': exportarMovs(); break;
      case 'renomear-cat': renomearCategoria(id); break;
      case 'excluir-cat': excluirCategoria(id); break;
      case 'escanear': abrirLeitor(); break;
      case 'onb-ocultar': gravarOnb('oculto'); refresh(); toast('Os primeiros passos foram ocultados.'); break;
      case 'exportar-dados': exportarDados(t); break;
      case 'escolher-plano':
        if (DB.apresentacao) { convitePara('Na sua conta, você escolhe entre os planos Básico, Pro e Premium e paga por Pix, na própria tela. A demonstração já está com todos os recursos liberados.'); break; }
        abrirEscolha(t.dataset.plano); break;
      case 'recomecar-demo':
        confirmar('Recomeçar a demonstração', 'Tudo o que você fez aqui é desfeito e a loja volta ao início.', 'Recomeçar').then((ok) => { if (ok) DB.resetar(); });
        break;
      case 'novo-produto-codigo': productForm(null, { codigoBarras: t.dataset.codigo }); break;
      case 'novo-fornecedor': fornecedorForm(); break;
      case 'editar-fornecedor': fornecedorForm(fornById(id)); break;
      case 'excluir-fornecedor': excluirFornecedor(id); break;
      case 'copiar-pedido': acaoPedido(t.dataset.grupo, false); break;
      case 'whatsapp-pedido': acaoPedido(t.dataset.grupo, true); break;
      case 'exportar-compras': exportarCompras(); break;
      case 'imp-aba': state.imp.aba = t.dataset.aba; render(); break;
      case 'baixar-modelo': baixarArquivo('modelo-produtos-estokio.csv', Imp.modeloCSV(), 'text/csv;charset=utf-8'); toast('Modelo baixado.'); break;
      case 'imp-cancelar': Object.assign(state.imp, { registros: null, analise: null, arquivo: '' }); refresh(); break;
      case 'imp-executar': executarPlanilha(t); break;
      case 'nfe-cancelar': state.imp.nfe = null; refresh(); break;
      case 'nfe-executar': executarNFe(t); break;
      case 'novo-convite':
        if (DB.apresentacao) { convitePara('Na sua conta, você convida até 4 pessoas por um código e cada uma tem o próprio login. Aqui a equipe é fictícia.'); break; }
        novoConvite(t); break;
      case 'copiar-convite': copiar(mensagemConvite(id)); break;
      case 'cancelar-convite': cancelarConvite(id); break;
      case 'remover-membro': removerMembro(id); break;
      case 'ver-alertas':
        Object.assign(state.f, { q: '', cat: '', nivel: 'alerta' });
        location.hash = '#/produtos'; break;
      case 'limpar-filtros':
        Object.assign(state.f, { q: '', cat: '', nivel: '', mq: '', tipo: '', de: '', ate: '' });
        render(); break;
      case 'logout': DB.logout(); break;
      default: if (ACOES_MOD[action]) ACOES_MOD[action](t, e);
    }
  });

  /* ---------- Produto ---------- */
  function productForm(p, prefill = {}) {
    const ed = Boolean(p && p.id);
    p = p || { unidade: 'un', ...prefill };
    const val = (k) => esc(p[k] ?? '');
    const m = openModal(`
      <form id="f-prod" novalidate>
        ${modalHead(ed ? 'Editar produto' : 'Novo produto')}
        <div class="modal-body grid-2">
          <label class="field span-2"><span>Nome do produto</span><input name="nome" required maxlength="120" value="${val('nome')}" autocomplete="off" autofocus></label>
          <label class="field"><span>Código ou SKU</span>
            <div class="input-scan"><input name="sku" maxlength="40" value="${val('sku')}" autocomplete="off" placeholder="Opcional">
            <button type="button" class="btn" data-gerar-sku title="Gerar automaticamente" aria-label="Gerar código ou SKU automaticamente">${icon('gerar')}</button></div></label>
          <div class="field"><label for="f-ean">Código de barras (EAN)</label>
            <div class="input-scan"><input id="f-ean" name="codigoBarras" maxlength="20" inputmode="numeric" value="${val('codigoBarras')}" autocomplete="off" placeholder="Opcional">
            ${recurso('leitor') ? `<button type="button" class="btn" data-scan-campo title="Ler com a câmera" aria-label="Ler código de barras com a câmera">${icon('codigo')}</button>` : ''}
            <button type="button" class="btn" data-gerar-ean title="Gerar um código de barras" aria-label="Gerar um código de barras automaticamente">${icon('gerar')}</button></div></div>
          <div class="scan-inline span-2" hidden></div>
          <label class="field"><span>Categoria</span><select name="categoriaId">
            <option value="">Sem categoria</option>
            ${sortedCats().map((c) => `<option value="${c.id}" ${p.categoriaId === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
          </select></label>
          <label class="field"><span>Fornecedor</span><select name="fornecedorId">
            <option value="">Sem fornecedor</option>
            ${sortedForn().map((f) => `<option value="${f.id}" ${p.fornecedorId === f.id ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}
          </select></label>
          <label class="field"><span>Unidade de medida</span><select name="unidade">
            ${UNIDADES.map((u) => `<option ${p.unidade === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select></label>
          <label class="field"><span>Localização</span><input name="localizacao" maxlength="60" value="${val('localizacao')}" placeholder="Ex.: Prateleira A3"></label>
          ${pode('verCusto') ? `<label class="field" data-nao-kit><span>Preço de custo (R$)</span><input name="custo" type="number" min="0" step="0.01" inputmode="decimal" value="${val('custo')}" placeholder="0,00"></label>` : ''}
          <label class="field"><span>Preço de venda (R$)</span><input name="preco" type="number" min="0" step="0.01" inputmode="decimal" value="${val('preco')}" placeholder="0,00"></label>
          <label class="field"><span>Estoque mínimo</span><input name="estoqueMinimo" type="number" min="0" step="any" inputmode="decimal" value="${val('estoqueMinimo')}" placeholder="0"></label>
          ${ed
            ? `<div class="field" data-nao-kit><span>Quantidade atual</span><p class="static-val">${nf.format(num(p.quantidade))} ${esc(p.unidade)}<small>Para mudar, registre uma entrada, saída ou ajuste.</small></p></div>`
            : `<label class="field" data-nao-kit><span>Quantidade inicial</span><input name="quantidadeInicial" type="number" min="0" step="any" inputmode="decimal" value="0"></label>`}
          <div data-nao-kit class="span-2 campos-modulos">${hook('prodCampos', p, ed)}</div>
          ${kitEditorHTML(p, ed)}
          <label class="field span-2"><span>Observações</span><textarea name="descricao" rows="2" maxlength="500">${val('descricao')}</textarea></label>
          <p class="form-error span-2" role="alert" hidden></p>
        </div>
        <footer class="modal-foot">
          <button type="button" class="btn" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn btn-primary">${ed ? 'Salvar alterações' : 'Cadastrar produto'}</button>
        </footer>
      </form>`, { wide: true });

    const form = $('#f-prod', m);
    hookDados('prodMontar', form, p, ed);
    montarKitEditor(form, p);
    const areaScan = $('.scan-inline', m);
    const botaoScan = $('[data-scan-campo]', m);
    if (botaoScan) botaoScan.addEventListener('click', () => {
      if (!areaScan.hidden) { pararLeitor(); areaScan.hidden = true; areaScan.innerHTML = ''; return; }
      areaScan.hidden = false;
      montarLeitor(areaScan, (cod) => {
        pararLeitor();
        form.codigoBarras.value = cod;
        areaScan.hidden = true; areaScan.innerHTML = '';
        toast(`Código ${cod} lido.`);
      });
    });
    const botaoGerarSku = $('[data-gerar-sku]', m);
    if (botaoGerarSku) botaoGerarSku.addEventListener('click', () => {
      form.sku.value = gerarSku(form.nome.value, p.id);
      form.sku.focus();
      toast('SKU gerado. Você pode editar antes de salvar.');
    });
    const botaoGerarEan = $('[data-gerar-ean]', m);
    if (botaoGerarEan) botaoGerarEan.addEventListener('click', () => {
      form.codigoBarras.value = gerarEan(p.id);
      form.codigoBarras.focus();
      toast('Código de barras gerado. Ele não existe em nenhuma base oficial: serve só para o controle interno.');
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const virouKit = form.ehKit && form.ehKit.checked;
      const dados = {
        nome: String(fd.get('nome') || '').trim(),
        sku: String(fd.get('sku') || '').trim(),
        codigoBarras: String(fd.get('codigoBarras') || '').trim(),
        categoriaId: fd.get('categoriaId') || '',
        fornecedorId: fd.get('fornecedorId') || '',
        unidade: fd.get('unidade') || 'un',
        localizacao: String(fd.get('localizacao') || '').trim(),
        custo: num(fd.get('custo')),
        preco: num(fd.get('preco')),
        estoqueMinimo: num(fd.get('estoqueMinimo')),
        descricao: String(fd.get('descricao') || '').trim()
      };
      // Quem não vê custo não manda custo (senão apagaria o valor que o responsável cadastrou)
      if (!pode('verCusto') || virouKit) delete dados.custo;
      if (!dados.nome) { form.nome.focus(); return showFormError(form, 'Informe o nome do produto.'); }
      if (virouKit) {
        const itens = lerItensKit(form, p.id);
        if (typeof itens === 'string') return showFormError(form, itens);
        dados.kit = itens; dados.quantidadeInicial = 0; dados.controlaValidade = false;
      } else if (form.ehKit && ed && ehKit(p)) dados.kit = [];
      if ([dados.custo, dados.preco, dados.estoqueMinimo].some((n) => n < 0)) return showFormError(form, 'Preços e estoque mínimo não podem ser negativos.');
      if (dados.sku && state.produtos.some((x) => x.id !== p.id && norm(x.sku) === norm(dados.sku))) {
        form.sku.focus(); return showFormError(form, `O código ${dados.sku} já está em uso por outro produto.`);
      }
      if (dados.codigoBarras) {
        const outro = state.produtos.find((x) => x.id !== p.id && x.codigoBarras && semZeros(x.codigoBarras) === semZeros(dados.codigoBarras));
        if (outro) { form.codigoBarras.focus(); return showFormError(form, `O código de barras ${dados.codigoBarras} já é do produto ${outro.nome}.`); }
      }
      if (!ed && limiteProdutos() && state.produtos.length >= limiteProdutos()) {
        return showFormError(form, `O plano ${state.empresa.planoNome || 'atual'} permite até ${limiteProdutos()} produtos. Fale com o suporte do Estokio para mudar de plano.`);
      }
      if (ed) dados.id = p.id;
      else {
        dados.quantidadeInicial = num(fd.get('quantidadeInicial'));
        if (dados.quantidadeInicial < 0) return showFormError(form, 'A quantidade inicial não pode ser negativa.');
      }
      if (!virouKit) { try { hookDados('prodDados', form, p, ed, dados); } catch (err) { return showFormError(form, err.message); } }
      showFormError(form, '');
      const btn = form.querySelector('[type=submit]');
      setBusy(btn, true);
      try {
        pararLeitor();
        await DB.saveProduct(dados, state.user);
        closeModal();
        toast(ed ? 'Alterações salvas.' : 'Produto cadastrado.');
      } catch (err) { showFormError(form, msgErro(err)); setBusy(btn, false); }
    });
  }

  async function excluirProduto(id) {
    const p = prodById(id);
    if (!p) return;
    const kits = state.produtos.filter((k) => ehKit(k) && k.kit.some((i) => i.produtoId === id));
    if (kits.length) return toast(`${p.nome} faz parte do kit ${kits.map((k) => k.nome).join(', ')}. Tire do kit antes de excluir.`, 'erro');
    const ok = await confirmar('Excluir produto', `<strong>${esc(p.nome)}</strong> sai da lista de produtos. O histórico de movimentações dele continua guardado.`, 'Excluir produto');
    if (!ok) return;
    try { await DB.deleteProduct(id); toast('Produto excluído.'); }
    catch (err) { toast(msgErro(err), 'erro'); }
  }

  /* ---------- Movimentação ---------- */
  function movementForm({ produtoId = '', tipo = 'entrada', quantidade = '', observacao = '', loteId = '', localId = '' }) {
    const ps = sortedProds();
    if (!ps.length) { toast('Cadastre um produto antes de registrar movimentações.', 'erro'); return; }
    const m = openModal(`
      <form id="f-mov" novalidate>
        ${modalHead('Registrar movimentação')}
        <div class="modal-body">
          <label class="field"><span>Produto</span><select name="produtoId" required ${produtoId ? '' : 'autofocus'}>
            <option value="">Escolha um produto</option>
            ${ps.map((p) => `<option value="${p.id}" ${p.id === produtoId ? 'selected' : ''}>${esc(p.nome)}${p.sku ? ` (${esc(p.sku)})` : ''}</option>`).join('')}
          </select></label>
          <fieldset class="seg">
            <legend>Tipo</legend>
            ${Object.entries({ entrada: 'Entrada', saida: 'Saída', ajuste: pode('gerir') ? 'Ajuste de inventário' : 'Pedir ajuste' })
              .filter(([k]) => (k === 'saida' || pode('estoque')))
              .map(([k, v]) => `
              <label class="seg-opt seg-${k}"><input type="radio" name="tipo" value="${k}" ${k === (pode('estoque') ? tipo : 'saida') ? 'checked' : ''}><span>${icon(k)}${v}</span></label>`).join('')}
          </fieldset>
          <div id="mov-extra-antes" data-local="${esc(localId)}"></div>
          <label class="field"><span id="qtd-label">Quantidade</span><input name="quantidade" type="number" min="0" step="any" inputmode="decimal" required value="${esc(quantidade)}" ${produtoId ? 'autofocus' : ''}></label>
          <div id="mov-extra" data-lote="${esc(loteId)}"></div>
          <div class="preview" id="mov-preview" aria-live="polite"></div>
          <label class="field"><span>Observação</span><input name="observacao" maxlength="200" value="${esc(observacao)}" placeholder="Ex.: Nota fiscal 1234, venda no balcão, perda"></label>
          <p class="form-error" role="alert" hidden></p>
        </div>
        <footer class="modal-foot">
          <button type="button" class="btn" data-action="close-modal">Cancelar</button>
          <button type="submit" class="btn btn-primary">Registrar movimentação</button>
        </footer>
      </form>`);

    const form = $('#f-mov', m);
    const prev = $('#mov-preview', m);

    function atualizar() {
      const p = prodById(form.produtoId.value);
      // Kit: só saída (os itens é que entram no estoque)
      $$('input[name=tipo]', form).forEach((r) => { r.disabled = Boolean(ehKit(p)) && r.value !== 'saida'; if (r.disabled && r.checked) { const s = form.querySelector('input[name=tipo][value=saida]'); if (s) s.checked = true; } });
      const t = form.tipo.value;
      $('#qtd-label', m).textContent = t === 'ajuste' ? 'Quantidade contada no estoque' : 'Quantidade';
      // Campos dos módulos (local, lote): redesenha só quando muda o produto ou o tipo
      const chave = `${p ? p.id : ''}|${t}`;
      for (const [id, nomeHook] of [['#mov-extra-antes', 'movCamposAntes'], ['#mov-extra', 'movCampos']]) {
        const box = $(id, m);
        if (box.dataset.chave !== chave) { box.innerHTML = p ? hook(nomeHook, p, t, box) : ''; box.dataset.chave = chave; }
      }
      if (!p) { prev.innerHTML = ''; prev.className = 'preview'; return; }
      if (ehKit(p)) {
        const q = num(form.quantidade.value) || 0, disp = kitDisponivel(p);
        prev.className = 'preview' + (q > disp ? ' is-error' : '');
        prev.innerHTML = `<span class="prev-label">Kit: dá para montar ${nf.format(disp)}. ${q ? `Saem: ${esc((p.kit || []).map((i) => { const c = prodById(i.produtoId); return `${nf.format(num(i.qtd) * q)} ${c ? c.nome : '?'}`; }).join(', '))}.` : ''}</span>
          ${q > disp ? '<span class="prev-err">Não há itens suficientes para essa quantidade de kits.</span>' : ''}`;
        return;
      }
      const antes = num(p.quantidade);
      const raw = form.quantidade.value;
      const q = num(raw);
      let depois = antes, erro = '';
      if (raw !== '') {
        if (t === 'entrada') depois = antes + q;
        else if (t === 'saida') { depois = antes - q; if (q > antes) erro = 'Saída maior que o estoque disponível.'; }
        else depois = q;
      }
      prev.className = 'preview' + (erro ? ' is-error' : '');
      prev.innerHTML = `
        <span class="prev-label">Estoque de ${esc(p.nome)}</span>
        <span class="prev-nums"><strong>${nf.format(antes)}</strong><span class="prev-arrow" aria-hidden="true"></span><strong>${nf.format(Math.round(depois * 1000) / 1000)}</strong> <span class="muted">${esc(p.unidade)}</span></span>
        ${erro ? `<span class="prev-err">${erro}</span>` : ''}`;
    }
    form.addEventListener('input', atualizar);
    form.addEventListener('change', atualizar);
    atualizar();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const dados = {
        produtoId: form.produtoId.value,
        tipo: form.tipo.value,
        quantidade: num(form.quantidade.value),
        observacao: form.observacao.value.trim()
      };
      if (!dados.produtoId) { form.produtoId.focus(); return showFormError(form, 'Escolha o produto.'); }
      if (form.quantidade.value === '') { form.quantidade.focus(); return showFormError(form, 'Informe a quantidade.'); }
      try { hookDados('movDados', form, prodById(dados.produtoId), dados); } catch (err) { return showFormError(form, err.message); }
      showFormError(form, '');
      const btn = form.querySelector('[type=submit]');
      setBusy(btn, true, 'Registrando…');
      try {
        const prod = prodById(dados.produtoId);
        if (ehKit(prod)) {
          await DB.venderKit({ kitId: prod.id, quantidade: dados.quantidade, observacao: dados.observacao, localId: dados.localId, localNome: dados.localNome, localPadrao: dados.localPadrao }, state.user);
          closeModal(); toast(`Saída de ${plural(dados.quantidade, 'kit', 'kits')} registrada. Os itens foram baixados do estoque.`);
          return;
        }
        if (dados.tipo === 'ajuste' && !pode('gerir')) {
          await DB.solicitarAjuste({ produtoId: prod.id, produtoNome: prod.nome, quantidade: dados.quantidade, sistema: num(prod.quantidade),
            localId: dados.localId || null, localNome: dados.localNome || '', lote: dados.lote || null, observacao: dados.observacao }, state.user);
          closeModal(); toast('Pedido de ajuste enviado. O responsável ou o gerente precisa aprovar.');
          return;
        }
        await DB.addMovement(dados, state.user);
        marcarTour('mov');
        closeModal();
        toast(`${TIPOS[dados.tipo]} registrada.`);
      } catch (err) { showFormError(form, msgErro(err)); setBusy(btn, false); }
    });
  }


  /* ================= papéis, aprovações e kits ================= */
  function escolherPapel() {
    return new Promise((res) => {
      const m = openModal(`
        <form id="f-papel" novalidate>
          ${modalHead('Convidar pessoa')}
          <div class="modal-body">
            <p class="confirm-text">O que essa pessoa vai poder fazer? Dá para mudar depois.</p>
            <div class="papel-opcoes">${['gerente', 'estoquista', 'caixa'].map((k) => `
              <label class="papel-op"><input type="radio" name="papel" value="${k}" ${k === 'estoquista' ? 'checked' : ''}><span><strong>${PAPEIS[k]}</strong><small>${PAPEIS_DESC[k]}</small></span></label>`).join('')}</div>
          </div>
          <footer class="modal-foot"><button type="button" class="btn" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit">Gerar convite</button></footer>
        </form>`);
      let escolhido = null;
      const f = $('#f-papel', m);
      f.addEventListener('submit', (e) => { e.preventDefault(); escolhido = f.papel.value; closeModal(); });
      const obs = new MutationObserver(() => { if (!document.body.contains(f)) { obs.disconnect(); res(escolhido); } });
      obs.observe(document.body, { childList: true, subtree: true });
    });
  }

  async function mudarPapel(uid, papel) {
    const m = state.membros.find((x) => x.id === uid);
    try { await DB.mudarPapel(uid, papel); toast(`${(m && (m.nome || m.email)) || 'A pessoa'} agora é ${PAPEIS[papel]}.`); }
    catch (err) { toast(msgErro(err), 'erro'); refresh(); }
  }

  /** Painel do responsável e do gerente: ajustes pedidos pela equipe. */
  function blocoAprovacoes() {
    if (!pode('gerir') || !state.solicitacoes.length) return '';
    return `
      <section class="panel aprov">
        <header class="panel-head"><h2>Ajustes aguardando aprovação</h2><span class="chip st-atualizar">${state.solicitacoes.length}</span></header>
        <ul class="aprov-lista">${state.solicitacoes.map((s) => {
          const p = prodById(s.produtoId);
          const dif = num(s.quantidade) - num(p ? p.quantidade : s.sistema);
          return `<li>
            <div class="aprov-txt"><strong>${esc(s.produtoNome)}</strong>
              <span>Contou ${nf.format(num(s.quantidade))}, o sistema tem ${nf.format(num(p ? p.quantidade : s.sistema))}${s.localNome ? ` em ${esc(s.localNome)}` : ''}: <b class="${dif < 0 ? 'neg' : 'pos'}">${dif > 0 ? '+' : ''}${nf.format(dif)}</b>${pode('verCusto') && p ? ` (${cf.format(dif * num(p.custo))})` : ''}</span>
              <span class="muted">${esc(nomeDe(s.solicitadoPor))}${s.criadoEm ? `, ${df.format(s.criadoEm)}` : ''}${s.observacao ? `. ${esc(s.observacao)}` : ''}</span></div>
            <div class="row-actions">
              <button class="btn btn-sm" data-action="recusar-ajuste" data-id="${s.id}">Recusar</button>
              <button class="btn btn-sm btn-primary" data-action="aprovar-ajuste" data-id="${s.id}">Aprovar</button>
            </div>
          </li>`; }).join('')}</ul>
      </section>`;
  }
  async function resolverAjuste(id, aprovar, btn) {
    const s = state.solicitacoes.find((x) => x.id === id);
    if (!s) return;
    setBusy(btn, true);
    try { await DB.resolverSolicitacao(s, aprovar, state.user); toast(aprovar ? 'Ajuste aprovado e lançado.' : 'Pedido de ajuste recusado.'); }
    catch (err) { toast(msgErro(err), 'erro'); setBusy(btn, false); }
  }

  /** Editor de itens do kit, dentro do formulário de produto. */
  function kitEditorHTML(p, ed) {
    const itens = ehKit(p) ? p.kit : [];
    if (!recurso('kits')) {
      const pl = planoQueLibera('kits');
      return `<div class="span-2 kit-box kit-bloq" data-nao-kit-bloq>${icon('cadeado')}<span>Kits e combos: ${pl ? `disponível a partir do plano <strong>${esc(pl.nome)}</strong>.` : 'indisponível no seu plano.'}${ehKit(p) ? ' Este produto é um kit e continua funcionando nas vendas, mas só dá para editar os itens num plano que traga kits.' : ''}</span>${ehDono() && pl ? `<button type="button" class="link-btn" data-action="escolher-plano" data-plano="${pl.id}">Ver planos</button>` : ''}</div>`;
    }
    if (ed && !ehKit(p) && num(p.quantidade) > 0) return '';
    const opcoes = (sel) => sortedProds().filter((x) => !ehKit(x) && x.id !== p.id).map((x) => `<option value="${x.id}" ${x.id === sel ? 'selected' : ''}>${esc(x.nome)}</option>`).join('');
    const linha = (i) => `<div class="kit-linha"><select name="kitItem" aria-label="Item do kit"><option value="">Escolha um produto</option>${opcoes(i.produtoId)}</select>
      <input name="kitQtd" type="number" min="0" step="any" value="${esc(i.qtd || 1)}" aria-label="Quantidade no kit"><button type="button" class="icon-btn i-del" data-kit-tirar aria-label="Tirar do kit">${icon('excluir')}</button></div>`;
    return `<div class="span-2 kit-box">
      <label class="check"><input type="checkbox" name="ehKit" ${ehKit(p) ? 'checked' : ''}> Este produto é um kit ou combo (a saída baixa cada item)</label>
      <div class="kit-itens" ${ehKit(p) ? '' : 'hidden'}>
        <div class="kit-lista">${(itens.length ? itens : [{}, {}]).map(linha).join('')}</div>
        <button type="button" class="btn btn-sm" data-kit-mais>${icon('plus')}Adicionar item</button>
        <p class="muted kit-nota">Kit não tem estoque próprio: o sistema mostra quantos dá para montar com os itens.</p>
        <template id="kit-linha-modelo">${linha({})}</template>
      </div>
    </div>`;
  }
  function montarKitEditor(form, p) {
    if (!form.ehKit) return;
    const box = form.querySelector('.kit-itens');
    const alternar = () => {
      const k = form.ehKit.checked;
      box.hidden = !k;
      $$('[data-nao-kit]', form).forEach((el) => { el.hidden = k; });
    };
    form.ehKit.addEventListener('change', alternar);
    alternar();
    box.addEventListener('click', (e) => {
      if (e.target.closest('[data-kit-mais]')) box.querySelector('.kit-lista').insertAdjacentHTML('beforeend', box.querySelector('#kit-linha-modelo').innerHTML);
      const t = e.target.closest('[data-kit-tirar]');
      if (t) t.closest('.kit-linha').remove();
    });
  }
  /** Itens válidos do kit, somando repetidos; devolve texto de erro se algo estiver errado. */
  function lerItensKit(form, proprioId) {
    const mapa = new Map();
    $$('.kit-linha', form).forEach((l) => {
      const id = l.querySelector('[name=kitItem]').value, q = num(l.querySelector('[name=kitQtd]').value);
      if (id && q > 0 && id !== proprioId) mapa.set(id, (mapa.get(id) || 0) + q);
    });
    if (!mapa.size) return 'Escolha pelo menos um item para o kit, com quantidade maior que zero.';
    return Array.from(mapa, ([produtoId, qtd]) => ({ produtoId, qtd }));
  }

  /* ---------- Categorias ---------- */
  function renomearCategoria(id) {
    const c = state.cats.find((x) => x.id === id);
    if (!c) return;
    const m = openModal(`
      <form id="f-rcat" novalidate>
        ${modalHead('Renomear categoria')}
        <div class="modal-body">
          <label class="field"><span>Nome</span><input name="nome" maxlength="60" value="${esc(c.nome)}" autofocus></label>
          <p class="form-error" role="alert" hidden></p>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit">Salvar nome</button></footer>
      </form>`);
    const form = $('#f-rcat', m);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = form.nome.value.trim();
      if (!nome) return showFormError(form, 'Digite o nome da categoria.');
      if (state.cats.some((x) => x.id !== id && norm(x.nome) === norm(nome))) return showFormError(form, 'Já existe uma categoria com esse nome.');
      const btn = form.querySelector('[type=submit]'); setBusy(btn, true);
      try { await DB.saveCategory({ id, nome }); closeModal(); toast('Nome salvo.'); }
      catch (err) { showFormError(form, msgErro(err)); setBusy(btn, false); }
    });
  }

  async function excluirCategoria(id) {
    const c = state.cats.find((x) => x.id === id);
    if (!c) return;
    const n = state.produtos.filter((p) => p.categoriaId === id).length;
    const aviso = n ? ` ${n === 1 ? 'O produto dela fica' : `Os ${n} produtos dela ficam`} como "Sem categoria".` : '';
    const ok = await confirmar('Excluir categoria', `Excluir a categoria <strong>${esc(c.nome)}</strong>?${aviso}`, 'Excluir categoria');
    if (!ok) return;
    try { await DB.deleteCategory(id); toast('Categoria excluída.'); }
    catch (err) { toast(msgErro(err), 'erro'); }
  }

  /* ---------- Equipe ---------- */
  async function novoConvite(btn) {
    const papel = await escolherPapel();
    if (!papel) return;
    setBusy(btn, true, 'Gerando…');
    try {
      const codigo = await DB.criarConviteEquipe(state.user, state.empresa.nome, 7, papel);
      const msg = mensagemConvite(codigo);
      openModal(`
        ${modalHead('Convite criado')}
        <div class="modal-body">
          <p class="confirm-text">Envie este código para a pessoa que vai entrar na equipe como <strong>${PAPEIS[papel]}</strong>. Ele vale por 7 dias e só pode ser usado uma vez.</p>
          <div class="code-big">${esc(codigo)}</div>
          <label class="field"><span>Mensagem pronta</span><textarea rows="6" readonly class="msg-box">${esc(msg)}</textarea></label>
        </div>
        <footer class="modal-foot">
          <button type="button" class="btn" data-action="copiar-convite" data-id="${esc(codigo)}">${icon('copiar')}Copiar mensagem</button>
          <a class="btn btn-primary" href="${waLink(codigo)}" target="_blank" rel="noopener">${icon('mensagem')}Enviar pelo WhatsApp</a>
        </footer>`);
    } catch (err) { toast(msgErro(err), 'erro'); }
    finally { setBusy(btn, false); }
  }

  async function cancelarConvite(id) {
    const ok = await confirmar('Cancelar convite', `O código <strong>${esc(id)}</strong> deixa de funcionar e a vaga fica livre.`, 'Cancelar convite');
    if (!ok) return;
    try { await DB.cancelarConvite(id); toast('Convite cancelado.'); }
    catch (err) { toast(msgErro(err), 'erro'); }
  }

  async function removerMembro(uid) {
    const m = state.membros.find((x) => x.id === uid);
    if (!m) return;
    const ok = await confirmar('Remover acesso', `<strong>${esc(m.nome || m.email)}</strong> deixa de acessar o estoque de ${esc(state.empresa.nome)} e a vaga fica livre. O histórico de movimentações dessa pessoa continua guardado.`, 'Remover acesso');
    if (!ok) return;
    try { await DB.removerMembro(uid); toast('Acesso removido.'); }
    catch (err) { toast(msgErro(err), 'erro'); }
  }

  /* ================= leitor de código de barras ================= */
  async function montarLeitor(container, aoLer) {
    pararLeitor();
    container.innerHTML = `
      <div class="scan-box"><video muted playsinline></video><span class="scan-mira" aria-hidden="true"></span></div>
      <p class="scan-status muted">Abrindo a câmera…</p>`;
    const status = container.querySelector('.scan-status');
    let parar = null, cancelado = false;
    const meu = () => { cancelado = true; if (parar) parar(); };
    state.pararScanner = meu;
    try {
      parar = await Scanner.iniciar(container.querySelector('video'), aoLer);
      if (cancelado) { parar(); return; }
      status.textContent = 'Aponte a câmera para o código de barras.';
    } catch (e) {
      if (cancelado) return;
      if (state.pararScanner === meu) state.pararScanner = null;
      container.querySelector('.scan-box').hidden = true;
      status.textContent = e.message;
      status.classList.add('scan-erro');
    }
  }

  function abrirLeitor() {
    const m = openModal(`${modalHead('Ler código de barras')}
      <div class="modal-body">
        <div id="leitor-area" class="leitor-area"></div>
        <form id="f-leitor" novalidate>
          <div class="field"><label for="leitor-cod">Ou digite o código. Leitores de código USB também funcionam aqui.</label>
            <div class="input-scan"><input id="leitor-cod" name="codigo" inputmode="numeric" autocomplete="off" ${touch() ? '' : 'autofocus'}><button class="btn" type="submit">Buscar</button></div></div>
        </form>
      </div>`, { semFoco: touch() });
    const achou = (cod) => { pararLeitor(); resultadoLeitura(cod); };
    $('#f-leitor', m).addEventListener('submit', (e) => { e.preventDefault(); const v = e.target.codigo.value.trim(); if (v) achou(v); });
    montarLeitor($('#leitor-area', m), achou);
  }

  function resultadoLeitura(cod) {
    if (!lerOnb('leitor')) { gravarOnb('leitor'); refresh(); }
    marcarTour('leitor'); // marca o passo "Leia um código de barras" na hora
    const p = prodPorCodigo(cod);
    if (!p) {
      openModal(`${modalHead('Produto não encontrado')}
        <div class="modal-body"><p class="confirm-text">Nenhum produto tem o código <strong>${esc(cod)}</strong>.</p></div>
        <footer class="modal-foot">
          <button class="btn" data-action="escanear">${icon('codigo')}Ler outro</button>
          <button class="btn btn-primary" data-action="novo-produto-codigo" data-codigo="${esc(cod)}">${icon('plus')}Cadastrar com este código</button>
        </footer>`);
      return;
    }
    openModal(`${modalHead(esc(p.nome))}
      <div class="modal-body">
        <div class="quick-prod">
          <span class="p-sku">${esc(p.sku || '')}${p.sku && p.codigoBarras ? ', ' : ''}${esc(p.codigoBarras || '')}</span>
          <div class="stock-cell"><strong class="quick-qtd">${nf.format(num(p.quantidade))}</strong> <span class="muted">${esc(p.unidade)} em estoque</span>
            ${nivel(p) !== 'ok' ? `<span class="badge badge-${nivel(p)}">${NIVEL_TXT[nivel(p)]}</span>` : ''}</div>
          ${gauge(p)}
          <span class="min-note">Mínimo ${nf.format(num(p.estoqueMinimo))}${p.localizacao ? `. Fica em ${esc(p.localizacao)}` : ''}</span>
        </div>
        <div class="quick-actions">
          <button class="quick-btn q-entrada" data-action="mov" data-tipo="entrada" data-id="${p.id}">${icon('entrada')}Entrada</button>
          <button class="quick-btn q-saida" data-action="mov" data-tipo="saida" data-id="${p.id}">${icon('saida')}Saída</button>
          <button class="quick-btn q-ajuste" data-action="mov" data-tipo="ajuste" data-id="${p.id}">${icon('ajuste')}Ajuste</button>
        </div>
      </div>
      <footer class="modal-foot">
        <button class="btn" data-action="editar-produto" data-id="${p.id}">${icon('editar')}Editar produto</button>
        <button class="btn btn-primary" data-action="escanear">${icon('codigo')}Ler outro</button>
      </footer>`, { semFoco: true });
  }

  /* ================= fornecedores ================= */
  /** Prazo real do fornecedor e as últimas entregas, para o formulário. */
  function blocoEntregas(f) {
    const pz = prazoDe(f.id);
    if (!pz.entregas) return '<span class="muted">Nenhuma entrega registrada ainda. Ao receber um pedido deste fornecedor, o Estokio guarda quantos dias ele levou.</span>';
    return `<span class="prazo-real-tit">Prazo real: <strong>${plural(pz.dias, 'dia', 'dias')}</strong> <span class="muted">(média de ${plural(pz.entregas, 'entrega', 'entregas')}${pz.min !== pz.max ? `, de ${pz.min} a ${pz.max} dias` : ''})</span></span>
      <ul class="entregas">${pz.ultimas.slice(0, 5).map((u) => `<li>Pedido ${esc(String(u.numero ?? ''))}${u.em ? `, recebido em ${dfd.format(u.em)}` : ''}: ${plural(u.dias, 'dia', 'dias')}</li>`).join('')}</ul>`;
  }

  function fornecedorForm(f) {
    const ed = Boolean(f && f.id);
    f = f || {};
    const val = (k) => esc(f[k] ?? '');
    const m = openModal(`
      <form id="f-forn" novalidate>
        ${modalHead(ed ? 'Editar fornecedor' : 'Novo fornecedor')}
        <div class="modal-body grid-2">
          <label class="field span-2"><span>Nome do fornecedor</span><input name="nome" maxlength="100" value="${val('nome')}" autofocus></label>
          <label class="field"><span>CNPJ ou CPF</span><input name="cnpj" maxlength="18" inputmode="numeric" value="${esc(fmtCnpj(f.cnpj))}" placeholder="Opcional"></label>
          <label class="field"><span>Pessoa de contato</span><input name="contato" maxlength="60" value="${val('contato')}" placeholder="Opcional"></label>
          <label class="field"><span>WhatsApp</span><input name="telefone" maxlength="20" inputmode="tel" value="${esc(fmtFone(f.telefone))}" placeholder="(81) 99999-9999"></label>
          <label class="field"><span>E-mail</span><input name="email" type="email" maxlength="120" value="${val('email')}" placeholder="Opcional"></label>
          <label class="field"><span>Prazo de entrega habitual (dias)</span><input name="prazoEntrega" type="number" min="0" max="365" step="1" inputmode="numeric" value="${val('prazoEntrega')}" placeholder="Ex.: 5"></label>
          <div class="field prazo-real">${ed ? blocoEntregas(f) : '<span class="muted">Depois que você receber pedidos deste fornecedor, o Estokio registra quantos dias ele levou e passa a usar a média real.</span>'}</div>
          <label class="field span-2"><span>Observações</span><textarea name="observacoes" rows="2" maxlength="500" placeholder="Pedido mínimo, dia de visita…">${val('observacoes')}</textarea></label>
          <p class="form-error span-2" role="alert" hidden></p>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="close-modal">Cancelar</button><button type="submit" class="btn btn-primary">${ed ? 'Salvar alterações' : 'Cadastrar fornecedor'}</button></footer>
      </form>`, { wide: true });
    const form = $('#f-forn', m);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const dados = {
        nome: form.nome.value.trim(), cnpj: digitos(form.cnpj.value), contato: form.contato.value.trim(),
        telefone: digitos(form.telefone.value), email: form.email.value.trim(), observacoes: form.observacoes.value.trim(),
        prazoEntrega: form.prazoEntrega.value.trim() === '' ? null : Math.round(num(form.prazoEntrega.value))
      };
      if (dados.prazoEntrega !== null && (dados.prazoEntrega < 0 || dados.prazoEntrega > 365)) { form.prazoEntrega.focus(); return showFormError(form, 'O prazo de entrega deve ficar entre 0 e 365 dias.'); }
      if (!dados.nome) { form.nome.focus(); return showFormError(form, 'Informe o nome do fornecedor.'); }
      if (state.fornecedores.some((x) => x.id !== f.id && norm(x.nome) === norm(dados.nome))) return showFormError(form, 'Já existe um fornecedor com esse nome.');
      if (dados.telefone && dados.telefone.length < 10) return showFormError(form, 'Informe o WhatsApp com DDD, por exemplo (81) 99999-9999.');
      if (ed) dados.id = f.id;
      const btn = form.querySelector('[type=submit]'); setBusy(btn, true);
      try { await DB.saveFornecedor(dados); closeModal(); toast(ed ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.'); }
      catch (err) { showFormError(form, msgErro(err)); setBusy(btn, false); }
    });
  }

  async function excluirFornecedor(id) {
    const f = fornById(id);
    if (!f) return;
    const n = state.produtos.filter((p) => p.fornecedorId === id).length;
    const ok = await confirmar('Excluir fornecedor', `Excluir <strong>${esc(f.nome)}</strong>?${n ? ` ${n === 1 ? 'O produto ligado a ele fica' : `Os ${n} produtos ligados a ele ficam`} sem fornecedor.` : ''}`, 'Excluir fornecedor');
    if (!ok) return;
    try { await DB.deleteFornecedor(id); toast('Fornecedor excluído.'); }
    catch (err) { toast(msgErro(err), 'erro'); }
  }

  /* ================= lista de compras ================= */
  function gruposCompra() {
    const { incluirDias, cobertura, ajustes } = state.compra;
    const itens = state.produtos
      .filter((p) => !ehKit(p) && (nivel(p) !== 'ok' || (acabaEm(p) !== null && acabaEm(p) <= incluirDias) || avaliar(p).motivos.length))
      .map((p) => {
        const media = mediaDia(p);
        const caminho = aCaminho(p.id);
        const aval = avaliar(p);
        // O que já está a caminho em pedidos abertos não entra de novo; o consumo durante a entrega também entra na conta
        const sugerido = Math.max(0, Prev.sugestao(p, media, cobertura, prazoDe(p.fornecedorId).dias || 0) - caminho);
        const aj = ajustes[p.id] || {};
        return { p, media, aval, acaba: acabaEm(p), sugerido, caminho, qtd: aj.qtd ?? sugerido, inc: aj.inc ?? sugerido > 0 };
      });
    const mapa = new Map();
    for (const i of itens) {
      const forn = fornById(i.p.fornecedorId);
      const id = forn ? forn.id : 'sem';
      if (!mapa.has(id)) mapa.set(id, { id, forn, nome: forn ? forn.nome : 'Sem fornecedor', itens: [] });
      mapa.get(id).itens.push(i);
    }
    const grupos = Array.from(mapa.values());
    grupos.forEach((g) => { g.prazo = prazoDe(g.forn ? g.forn.id : null); g.itens.sort((a, b) => (b.aval.urgente - a.aval.urgente) || (a.acaba ?? 1e9) - (b.acaba ?? 1e9) || a.p.nome.localeCompare(b.p.nome, 'pt-BR')); });
    return grupos.sort((a, b) => (a.id === 'sem') - (b.id === 'sem') || a.nome.localeCompare(b.nome, 'pt-BR'));
  }
  const totalGrupo = (g) => g.itens.reduce((s, i) => s + (i.inc ? num(i.qtd) * num(i.p.custo) : 0), 0);

  function atualizarTotaisCompra() {
    const grupos = gruposCompra();
    let geral = 0;
    grupos.forEach((g) => {
      const t = totalGrupo(g); geral += t;
      const el = $(`[data-cp-total="${g.id}"]`); if (el) el.textContent = cf.format(t);
      g.itens.forEach((i) => {
        const c = $(`[data-cp-custo="${i.p.id}"]`);
        if (c && num(i.p.custo)) c.textContent = cf.format(num(i.qtd) * num(i.p.custo));
        const tr = $(`[data-linha="${i.p.id}"]`); if (tr) tr.classList.toggle('is-off', !i.inc);
      });
    });
    const tg = $('#cp-total-geral'); if (tg) tg.textContent = cf.format(geral);
  }

  function textoPedido(g) {
    const itens = g.itens.filter((i) => i.inc && num(i.qtd) > 0);
    if (!itens.length) return null;
    const oi = g.forn && g.forn.contato ? `Olá, ${g.forn.contato}!` : 'Olá!';
    return `${oi} Gostaria de fazer um pedido para ${state.empresa.nome}:\n\n` +
      itens.map((i) => `- ${nf.format(num(i.qtd))} ${i.p.unidade} de ${i.p.nome}${i.p.sku ? ` (cód. ${i.p.sku})` : ''}`).join('\n') +
      '\n\nPode confirmar a disponibilidade, o valor e o prazo de entrega? Obrigado!';
  }

  function acaoPedido(grupoId, whatsapp) {
    const g = gruposCompra().find((x) => x.id === grupoId);
    if (!g) return;
    const txt = textoPedido(g);
    if (!txt) return toast('Nenhum item marcado com quantidade para este pedido.', 'erro');
    if (whatsapp) window.open(`https://wa.me/${waNumero(g.forn.telefone)}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
    else copiar(txt);
  }

  function exportarCompras() {
    const linhas = [];
    gruposCompra().forEach((g) => g.itens.filter((i) => i.inc).forEach((i) => linhas.push([
      g.nome, i.p.nome, i.p.sku, i.p.codigoBarras || '', i.p.unidade, num(i.p.quantidade), num(i.p.estoqueMinimo),
      Math.round(i.media * 100) / 100, i.acaba === null ? '' : Math.round(i.acaba), num(i.qtd), num(i.p.custo), Math.round(num(i.qtd) * num(i.p.custo) * 100) / 100
    ])));
    if (!linhas.length) return toast('A lista de compras está vazia.', 'erro');
    baixarCSV(`${slug()}-lista-de-compras-${hojeStr()}.csv`, [
      ['Fornecedor', 'Produto', 'Código', 'Código de barras', 'Unidade', 'Estoque', 'Mínimo', 'Consumo por dia', 'Acaba em (dias)', 'Comprar', 'Custo unitário (R$)', 'Custo estimado (R$)'],
      ...linhas
    ]);
    toast('Lista de compras exportada.');
  }

  /* ================= importar: planilha ================= */
  const ROTULO = { custo: 'Custo', preco: 'Preço de venda', estoqueMinimo: 'Estoque mínimo', quantidade: 'Quantidade' };

  function shellPlanilha() {
    return `
      <section class="panel imp-step">
        <header class="panel-head"><h2><span class="step-n">1</span>Baixe o modelo</h2>
          <button class="btn btn-primary" data-action="baixar-modelo">${icon('exportar')}Baixar modelo CSV</button></header>
        <div class="imp-text">
          <p>Abra o modelo no Excel ou no Google Planilhas, preencha uma linha por produto e salve como CSV ou XLSX. Só a coluna <strong>nome</strong> é obrigatória: apague as colunas que não usar e as duas linhas de exemplo. Nomes de coluna parecidos (como <em>produto</em>, <em>ean</em> ou <em>qtd</em>) também são reconhecidos.</p>
        </div>
        <div class="table-wrap flat">
          <table class="table cols-table">
            <thead><tr><th>Coluna</th><th>O que colocar</th><th>Exemplo</th></tr></thead>
            <tbody>${Imp.COLUNAS.map((c) => `<tr>
              <td class="nowrap"><code class="col-name">${c.coluna}</code>${c.obrigatoria ? ' <span class="badge badge-zerado">Obrigatória</span>' : ''}</td>
              <td>${esc(c.desc)}</td>
              <td class="muted nowrap">${esc(c.ex[0] || c.ex[1])}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </section>
      <section class="panel imp-step">
        <header class="panel-head"><h2><span class="step-n">2</span>Envie a planilha</h2></header>
        <div class="imp-text stack">
          <label class="dropzone">${icon('importar')}<strong>Escolher arquivo</strong><span class="muted">ou arraste para cá. CSV, XLSX ou XLS.</span>
            <input type="file" accept=".csv,.txt,.xlsx,.xls,.ods" class="sr-only" data-imp-arquivo="planilha"></label>
          <label class="check"><input type="checkbox" data-imp="atualizar" ${state.imp.atualizar ? 'checked' : ''}> Atualizar os produtos que já existem (mesmo código ou mesmo código de barras). Células vazias não apagam o que já está cadastrado.</label>
          <label class="check"><input type="checkbox" data-imp="ajustarQtd" ${state.imp.ajustarQtd ? 'checked' : ''}> Também ajustar a quantidade em estoque dos produtos que já existem</label>
        </div>
      </section>`;
  }

  async function receberPlanilha(arquivo) {
    const I = state.imp;
    try {
      const matriz = await Imp.lerPlanilha(arquivo);
      const r = Imp.mapearPlanilha(matriz);
      Object.assign(I, { registros: r.registros, reconhecidas: r.reconhecidas, ignoradas: r.ignoradas, arquivo: arquivo.name });
      analisarPlanilha();
      refresh();
      const alvo = $('#view-body'); if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { toast(e.message, 'erro'); }
  }

  function analisarPlanilha() {
    const I = state.imp;
    const porSku = new Map(), porEan = new Map();
    state.produtos.forEach((p) => { if (p.sku) porSku.set(norm(p.sku), p); if (p.codigoBarras) porEan.set(semZeros(p.codigoBarras), p); });
    const catExist = new Map(state.cats.map((c) => [norm(c.nome), c.id]));
    const fornExist = new Map(state.fornecedores.map((f) => [norm(f.nome), f.id]));
    const vistosSku = new Map(), vistosEan = new Map();
    const txt = (v) => String(v ?? '').trim();

    const linhas = I.registros.map(({ linha, dados }) => {
      const erros = [], avisos = [];
      const nome = txt(dados.nome);
      if (!nome) erros.push('Sem nome');
      const nums = {};
      for (const k of ['custo', 'preco', 'estoqueMinimo', 'quantidade']) {
        if (!(k in dados)) continue;
        const n = Imp.numero(dados[k]);
        if (Number.isNaN(n)) erros.push(`${ROTULO[k]} inválido ("${txt(dados[k])}")`);
        else if (n !== null && n < 0) erros.push(`${ROTULO[k]} negativo`);
        else if (n !== null) nums[k] = n;
      }
      let validade = null;
      if ('validade' in dados && txt(dados.validade)) {
        const dv = Imp.dataPlanilha(dados.validade);
        if (Number.isNaN(dv)) erros.push(`Data de validade inválida ("${txt(dados.validade)}")`);
        else validade = dv;
      }
      const loteTxt = txt(dados.lote);
      if (loteTxt && validade === null && !erros.length) avisos.push('Lote informado sem validade: foi ignorado');
      let un = 'un';
      if (txt(dados.unidade)) { un = Imp.unidade(dados.unidade); if (!un) { avisos.push(`Unidade "${txt(dados.unidade)}" virou un`); un = 'un'; } }
      const sku = txt(dados.sku);
      const ean = txt(dados.codigoBarras).replace(/\.0+$/, '');
      if (sku) { const k = norm(sku); if (vistosSku.has(k)) erros.push(`Código repetido na linha ${vistosSku.get(k)}`); else vistosSku.set(k, linha); }
      if (ean) { const k = semZeros(ean); if (vistosEan.has(k)) erros.push(`Código de barras repetido na linha ${vistosEan.get(k)}`); else vistosEan.set(k, linha); }
      const existente = (sku && porSku.get(norm(sku))) || (ean && porEan.get(semZeros(ean))) || null;

      // Células vazias não apagam o que o produto já tem
      const campos = { nome };
      if (sku) campos.sku = sku;
      if (ean) campos.codigoBarras = ean;
      if (txt(dados.unidade)) campos.unidade = un;
      if (txt(dados.localizacao)) campos.localizacao = txt(dados.localizacao);
      if (txt(dados.descricao)) campos.descricao = txt(dados.descricao);
      ['custo', 'preco', 'estoqueMinimo'].forEach((k) => { if (nums[k] !== undefined) campos[k] = nums[k]; });
      const cat = txt(dados.categoria), forn = txt(dados.fornecedor);
      if (cat) { const id = catExist.get(norm(cat)); if (id) campos.categoriaId = id; else campos._categoriaNome = cat; }
      if (forn) { const id = fornExist.get(norm(forn)); if (id) campos.fornecedorId = id; else campos._fornecedorNome = forn; }

      const acao = erros.length ? 'erro' : existente ? (I.atualizar ? 'atualizar' : 'ignorar') : 'novo';
      // A validade só é aplicada ao criar o produto: para um que já existe, cria-se a entrada pela tela de Estoque
      if (existente && validade !== null) avisos.push('Validade não entra em produto que já existe: registre a entrada pelo Estoque, informando o lote.');
      return { linha, nome, sku, ean, acao, erros, avisos, existente, campos, quantidade: nums.quantidade ?? null, validade, lote: loteTxt };
    });
    const cont = { novo: 0, atualizar: 0, ignorar: 0, erro: 0 };
    linhas.forEach((l) => cont[l.acao]++);
    I.analise = { linhas, cont };
  }

  function corpoPlanilha() {
    const I = state.imp;
    if (!I.analise) return '';
    const { linhas, cont } = I.analise;
    const total = cont.novo + cont.atualizar;
    const SIT = { novo: ['Novo', 'st-novo'], atualizar: ['Atualizar', 'st-atualizar'], ignorar: ['Já existe', 'st-ignorar'], erro: ['Erro', 'st-erro'] };
    const MAX = 300;
    return `
      <section class="panel imp-step">
        <header class="panel-head"><h2><span class="step-n">3</span>Confira e importe</h2><span class="p-meta">${esc(I.arquivo)}</span></header>
        <div class="imp-text">
          <div class="imp-resumo">
            <span class="chip st-novo">${plural(cont.novo, 'produto novo', 'produtos novos')}</span>
            ${cont.atualizar ? `<span class="chip st-atualizar">${plural(cont.atualizar, 'atualização', 'atualizações')}</span>` : ''}
            ${cont.ignorar ? `<span class="chip st-ignorar">${plural(cont.ignorar, 'já existe e será ignorado', 'já existem e serão ignorados')}</span>` : ''}
            ${cont.erro ? `<span class="chip st-erro">${plural(cont.erro, 'linha com erro', 'linhas com erro')}</span>` : ''}
          </div>
          ${I.ignoradas.length ? `<p class="imp-aviso">Colunas que não reconheci e vou ignorar: ${I.ignoradas.map(esc).join(', ')}.</p>` : ''}
          ${cont.erro ? '<p class="imp-aviso">As linhas com erro não serão importadas. Corrija na planilha e envie de novo, se quiser.</p>' : ''}
        </div>
        <div class="table-wrap flat">
          <table class="table">
            <thead><tr><th class="num">Linha</th><th>Produto</th><th>Código</th><th class="num">Quantidade</th><th>Validade</th><th>Situação</th></tr></thead>
            <tbody>${linhas.slice(0, MAX).map((l) => `
              <tr>
                <td class="num muted">${l.linha}</td>
                <td><span class="p-name">${esc(l.nome) || '<span class="muted">Sem nome</span>'}</span>${l.existente && l.existente.nome !== l.nome ? `<span class="p-sku">Hoje: ${esc(l.existente.nome)}</span>` : ''}</td>
                <td><span class="p-sku">${esc(l.sku)}</span><span class="p-sku">${esc(l.ean)}</span></td>
                <td class="num">${l.quantidade === null ? '<span class="muted">Não informada</span>' : nf.format(l.quantidade)}</td>
                <td>${l.validade ? dfd.format(l.validade) + (l.lote ? `<span class="p-sku">Lote ${esc(l.lote)}</span>` : '') : '<span class="muted">—</span>'}</td>
                <td><span class="chip ${SIT[l.acao][1]}">${SIT[l.acao][0]}</span>${l.erros.concat(l.avisos).map((m) => `<span class="p-sku imp-msg">${esc(m)}</span>`).join('')}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${linhas.length > MAX ? `<p class="table-foot">Mostrando as primeiras ${MAX} de ${linhas.length} linhas. Todas serão importadas.</p>` : ''}
        <footer class="imp-foot">
          <button class="btn" data-action="imp-cancelar">Cancelar</button>
          <button class="btn btn-primary" data-action="imp-executar" ${total && !I.ocupado ? '' : 'disabled'}>${I.ocupado ? 'Importando…' : `Importar ${plural(total, 'produto', 'produtos')}`}</button>
        </footer>
      </section>`;
  }

  async function executarPlanilha(btn) {
    const I = state.imp;
    if (!I.analise || I.ocupado) return;
    const ls = I.analise.linhas;
    const padrao = { sku: '', codigoBarras: '', categoriaId: '', fornecedorId: '', unidade: 'un', localizacao: '', custo: 0, preco: 0, estoqueMinimo: 0, descricao: '' };
    const novos = ls.filter((l) => l.acao === 'novo').map((l) => {
      const item = { campos: { ...padrao, ...l.campos }, quantidadeInicial: l.quantidade || 0 };
      if (l.validade !== null) {
        item.campos.controlaValidade = true;
        item.lote = { lote: l.lote || 'Importação', validade: l.validade };
      }
      return item;
    });
    const atualiz = ls.filter((l) => l.acao === 'atualizar');
    const atualizacoes = atualiz.map((l) => ({ id: l.existente.id, campos: l.campos }));
    const ajustes = I.ajustarQtd
      ? atualiz.filter((l) => l.quantidade !== null && l.quantidade !== num(l.existente.quantidade)).map((l) => ({ produtoId: l.existente.id, quantidade: l.quantidade }))
      : [];
    const unicos = (k) => Array.from(new Map(ls.filter((l) => l.acao === 'novo' || l.acao === 'atualizar').map((l) => l.campos[k]).filter(Boolean).map((n) => [norm(n), n])).values());
    const plano = { novos, atualizacoes, ajustes, categoriasNovas: unicos('_categoriaNome'), fornecedoresNovos: unicos('_fornecedorNome') };
    if (limiteProdutos() && state.produtos.length + novos.length > limiteProdutos()) {
      return toast(`O plano ${state.empresa.planoNome || 'atual'} permite até ${limiteProdutos()} produtos. Você tem ${state.produtos.length} e a planilha traz ${novos.length} novos.`, 'erro');
    }

    I.ocupado = true;
    btn.disabled = true;
    try {
      await DB.importarProdutos(plano, state.user, (feito, total) => { btn.textContent = `Importando… ${Math.round((feito / total) * 100)}%`; });
      toast(`Importação concluída: ${plural(novos.length, 'produto novo', 'produtos novos')}${atualizacoes.length ? ` e ${plural(atualizacoes.length, 'atualização', 'atualizações')}` : ''}.`);
      Object.assign(I, { registros: null, analise: null, arquivo: '' });
    } catch (err) {
      // O import vai em vários lotes pequenos: se um falhar, os anteriores já foram gravados
      const parcial = err && err.gravadas ? ` ${err.gravadas} de ${err.total} registros já foram gravados. Envie a planilha de novo: os produtos já importados serão atualizados, não repetidos.` : '';
      toast(msgErro(err) + parcial, 'erro');
    }
    finally { I.ocupado = false; refresh(); }
  }

  /* ================= importar: nota fiscal ================= */
  function shellNFe() {
    return `
      <section class="panel imp-step">
        <header class="panel-head"><h2>Lançar entrada pela nota fiscal</h2></header>
        <div class="imp-text stack">
          <p>Envie o XML da NF-e de compra. O fornecedor costuma mandar o arquivo junto com o PDF da nota, e ele também pode ser baixado no portal da SEFAZ. O Estokio lê os itens, liga cada um a um produto seu e lança todas as entradas de uma vez. Na próxima nota do mesmo fornecedor, ele já lembra quais itens correspondem a quais produtos.</p>
          <label class="dropzone">${icon('importar')}<strong>Escolher XML da nota</strong><span class="muted">ou arraste para cá. Arquivo .xml.</span>
            <input type="file" accept=".xml,text/xml,application/xml" class="sr-only" data-imp-arquivo="nfe"></label>
        </div>
      </section>`;
  }

  async function receberXML(arquivo) {
    try {
      let texto = await Imp.lerTexto(arquivo, 'utf-8');
      if (texto.includes('\uFFFD')) texto = await Imp.lerTexto(arquivo, 'windows-1252');
      const nota = Imp.lerNFe(texto);
      const ja = state.notas.find((n) => n.id === nota.chave.replace(/[^A-Za-z0-9-]/g, ''));
      if (ja) toast(`Atenção: esta nota já foi lançada em ${dfd.format(ja.criadoEm)}.`, 'erro');
      const cnpj = digitos(nota.fornecedor.cnpj);
      const forn = state.fornecedores.find((f) => cnpj && digitos(f.cnpj) === cnpj)
        || state.fornecedores.find((f) => norm(f.nome) === norm(nota.fornecedor.nome) || norm(f.nome) === norm(nota.fornecedor.razao));
      const escolhas = nota.itens.map((it) => {
        const ref = `${cnpj}|${it.codigo}`;
        let p = state.produtos.find((x) => (x.refsNFe || []).includes(ref)), motivo = 'já ligado antes';
        if (!p && it.ean) { p = prodPorCodigo(it.ean); motivo = 'código de barras'; }
        if (!p && it.codigo) { p = state.produtos.find((x) => x.sku && norm(x.sku) === norm(it.codigo)); motivo = 'código'; }
        if (!p) { p = state.produtos.find((x) => norm(x.nome) === norm(it.nome)); motivo = 'nome igual'; }
        return { acao: p ? p.id : 'novo', motivo: p ? motivo : '', qtd: it.quantidade, ref };
      });
      state.imp.nfe = { nota, fornecedorId: forn ? forn.id : null, escolhas, atualizarCusto: true };
      refresh();
    } catch (e) { toast(e.message, 'erro'); }
  }

  function corpoNFe() {
    const N = state.imp.nfe;
    if (!N) {
      if (!state.notas.length) return '';
      return `
        <section class="panel">
          <header class="panel-head"><h2>Notas lançadas recentemente</h2></header>
          <div class="table-wrap flat"><table class="table">
            <thead><tr><th>Nota</th><th>Fornecedor</th><th>Emissão</th><th class="num">Itens</th><th class="num">Valor</th><th>Lançada</th></tr></thead>
            <tbody>${state.notas.map((n) => `<tr>
              <td class="nowrap"><strong>${esc(n.numero)}</strong>${n.serie ? `<span class="muted">/${esc(n.serie)}</span>` : ''}</td>
              <td>${esc(n.fornecedorNome)}</td>
              <td class="nowrap">${n.emissao ? dfd.format(n.emissao) : ''}</td>
              <td class="num">${n.itens}</td>
              <td class="num">${cf.format(num(n.valor))}</td>
              <td><span class="p-sku">${n.criadoEm ? df.format(n.criadoEm) : ''}</span><span class="p-sku">${esc(nomeDe(n.lancadaPor))}</span></td>
            </tr>`).join('')}</tbody>
          </table></div>
        </section>`;
    }
    const n = N.nota;
    const forn = fornById(N.fornecedorId);
    const lancar = N.escolhas.filter((e) => e.acao !== 'ignorar').length;
    const prods = sortedProds();
    return `
      <section class="panel imp-step">
        <header class="panel-head">
          <div class="grupo-tit"><h2>NF-e ${esc(n.numero)}${n.serie ? `, série ${esc(n.serie)}` : ''}</h2>
            <span class="p-meta">${n.emissao ? `Emitida em ${dfd.format(n.emissao)}, ` : ''}${plural(n.itens.length, 'item', 'itens')}, valor total ${cf.format(n.valor)}</span></div>
          <button class="link-btn" data-action="nfe-cancelar">Trocar arquivo</button>
        </header>
        <div class="imp-text">
          <div class="nfe-forn">
            <span class="muted">Fornecedor</span>
            <strong>${esc(n.fornecedor.nome)}</strong>
            <span class="p-sku">${esc(fmtCnpj(n.fornecedor.cnpj))}</span>
            ${forn ? `<span class="chip st-atualizar">Já cadastrado como ${esc(forn.nome)}</span>` : '<span class="chip st-novo">Será cadastrado</span>'}
          </div>
        </div>
        <div class="table-wrap flat">
          <table class="table nfe-table">
            <thead><tr><th>Item da nota</th><th class="num">Na nota</th><th>No seu estoque</th><th class="num">Lançar</th><th class="num">Custo unitário</th></tr></thead>
            <tbody>${n.itens.map((it, i) => {
              const e = N.escolhas[i];
              const p = prodById(e.acao);
              const un = p ? p.unidade : it.unidade;
              const custoUn = num(e.qtd) > 0 ? it.valorTotal / num(e.qtd) : 0;
              return `<tr class="${e.acao === 'ignorar' ? 'is-off' : ''}" data-nfe-linha="${i}">
                <td><span class="p-name">${esc(it.nome)}</span><span class="p-sku">Cód. ${esc(it.codigo)}${it.ean ? `, EAN ${esc(it.ean)}` : ''}</span></td>
                <td class="num nowrap">${nf.format(it.quantidade)} ${esc(it.unidadeNota)}<span class="p-sku">${cf.format(it.valorUnit)} cada</span></td>
                <td class="nfe-sel">
                  <select data-nfe-acao="${i}" aria-label="Produto para o item ${esc(it.nome)}">
                    <option value="novo" ${e.acao === 'novo' ? 'selected' : ''}>Cadastrar como produto novo</option>
                    <option value="ignorar" ${e.acao === 'ignorar' ? 'selected' : ''}>Não lançar este item</option>
                    <optgroup label="Seus produtos">${prods.map((x) => `<option value="${x.id}" ${e.acao === x.id ? 'selected' : ''}>${esc(x.nome)}${x.sku ? ` (${esc(x.sku)})` : ''}</option>`).join('')}</optgroup>
                  </select>
                  ${e.motivo && p ? `<span class="p-sku match">Encontrado pelo ${esc(e.motivo)}</span>` : ''}
                </td>
                <td class="num nowrap"><input type="number" class="qtd-input" min="0" step="any" inputmode="decimal" data-nfe-qtd="${i}" value="${e.qtd}" aria-label="Quantidade a lançar de ${esc(it.nome)}"> <span class="muted">${esc(un)}</span></td>
                <td class="num" data-nfe-custo="${i}">${cf.format(custoUn)}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
        <div class="imp-text stack">
          <label class="check"><input type="checkbox" data-nfe-custo-upd ${N.atualizarCusto ? 'checked' : ''}> Atualizar o preço de custo dos produtos com o valor desta nota</label>
          <p class="muted imp-dica">Se o fornecedor vende em caixa e você controla em unidade, mude a quantidade a lançar (por exemplo, 2 caixas com 12 viram 24). O custo unitário é recalculado. Produtos novos entram sem preço de venda: preencha depois em Produtos.</p>
        </div>
        <footer class="imp-foot">
          <button class="btn" data-action="nfe-cancelar">Cancelar</button>
          <button class="btn btn-primary" data-action="nfe-executar" ${lancar && !state.imp.ocupado ? '' : 'disabled'}>${state.imp.ocupado ? 'Lançando…' : `Lançar entrada de ${plural(lancar, 'item', 'itens')}`}</button>
        </footer>
      </section>`;
  }

  async function executarNFe(btn) {
    const N = state.imp.nfe;
    if (!N || state.imp.ocupado) return;
    const n = N.nota;
    const novos = [], vinculos = [];
    for (let i = 0; i < n.itens.length; i++) {
      const it = n.itens[i], e = N.escolhas[i];
      if (e.acao === 'ignorar') continue;
      const q = num(e.qtd);
      if (q <= 0) return toast(`Informe a quantidade a lançar de ${it.nome}, ou marque "Não lançar este item".`, 'erro');
      const custo = Math.round((it.valorTotal / q) * 10000) / 10000;
      if (e.acao === 'novo') {
        novos.push({
          campos: { nome: it.nome.slice(0, 120), sku: '', codigoBarras: it.ean, categoriaId: '', unidade: it.unidade, localizacao: '', custo, preco: 0, estoqueMinimo: 0, descricao: `Código no fornecedor: ${it.codigo}` },
          quantidade: q, ref: e.ref
        });
      } else {
        const v = { produtoId: e.acao, quantidade: q, ref: e.ref, ean: it.ean, lote: { lote: it.lote || `NF-e ${n.numero}`, validade: it.validade || null } };
        if (N.atualizarCusto) v.custo = custo;
        vinculos.push(v);
      }
    }
    state.imp.ocupado = true;
    btn.disabled = true;
    try {
      await DB.importarNFe({ nota: n, fornecedorId: N.fornecedorId, novos, vinculos }, state.user, (feito, total) => { btn.textContent = `Lançando… ${Math.round((feito / total) * 100)}%`; });
      toast(`Entrada da NF-e ${n.numero} lançada: ${plural(novos.length + vinculos.length, 'item', 'itens')}.`);
      state.imp.nfe = null;
    } catch (err) { toast(msgErro(err), 'erro'); }
    finally { state.imp.ocupado = false; refresh(); }
  }

  // Campos das telas de compras e importação (sem redesenhar a tela, para não perder o foco)
  function aoMudarCampo(e) {
    const t = e.target, d = t.dataset;
    if (d.cp) { state.compra[d.cp] = Number(t.value); salvarPrefCompra(); refresh(); return; }
    if (d.cpQtd) { (state.compra.ajustes[d.cpQtd] ||= {}).qtd = t.value === '' ? 0 : num(t.value); atualizarTotaisCompra(); return; }
    if (d.cpInc) { (state.compra.ajustes[d.cpInc] ||= {}).inc = t.checked; atualizarTotaisCompra(); return; }
    if (d.impArquivo && e.type === 'change') { const f = t.files[0]; t.value = ''; if (f) (d.impArquivo === 'planilha' ? receberPlanilha : receberXML)(f); return; }
    if (d.imp && e.type === 'change') { state.imp[d.imp] = t.checked; if (state.imp.registros) analisarPlanilha(); refresh(); return; }
    const N = state.imp.nfe;
    if (!N) return;
    if (d.nfeAcao !== undefined && e.type === 'change') { N.escolhas[d.nfeAcao].acao = t.value; N.escolhas[d.nfeAcao].motivo = ''; refresh(); return; }
    if (d.nfeQtd !== undefined) {
      const i = Number(d.nfeQtd);
      N.escolhas[i].qtd = t.value === '' ? 0 : num(t.value);
      const q = num(N.escolhas[i].qtd);
      const c = $(`[data-nfe-custo="${i}"]`); if (c) c.textContent = cf.format(q > 0 ? N.nota.itens[i].valorTotal / q : 0);
      return;
    }
    if (d.nfeCustoUpd !== undefined) N.atualizarCusto = t.checked;
  }
  $('#view').addEventListener('input', aoMudarCampo);
  $('#view').addEventListener('change', aoMudarCampo);

  /* ---------- CSV ---------- */
  /** Pedido de exclusão definitiva da empresa (direito da LGPD). Só grava o pedido; quem apaga é o admin, depois de revisar. */
  function modalPedirExclusao() {
    const m = openModal(`
      <form id="f-exclusao" novalidate>
        ${modalHead('Solicitar exclusão definitiva')}
        <div class="modal-body">
          <p class="confirm-text">Isto pede a exclusão <strong>definitiva</strong> da empresa ${esc(state.empresa.nome)} e de todos os dados: estoque, movimentações, fornecedores, notas, usuários. Não é instantâneo — alguém do Estokio revisa o pedido antes de apagar, e o sistema continua funcionando normalmente até lá. Você pode cancelar o pedido a qualquer momento, enquanto ele não for atendido.</p>
          <p class="confirm-text">Se quiser uma cópia antes, baixe os dados pela Central de Privacidade antes de confirmar.</p>
          <label class="field"><span>Motivo (opcional, ajuda a gente a melhorar)</span><textarea name="motivo" rows="2" maxlength="300" placeholder="Por que você está saindo?"></textarea></label>
          <p class="form-error" role="alert" hidden></p>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="close-modal">Cancelar</button><button class="btn btn-danger" type="submit">Solicitar exclusão</button></footer>
      </form>`);
    const f = $('#f-exclusao', m);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = f.querySelector('[type=submit]'); setBusy(btn, true, 'Enviando…');
      try {
        await DB.solicitarExclusao(f.motivo.value.trim(), state.user);
        closeModal();
        toast('Pedido de exclusão enviado. A gente revisa e confirma com você antes de apagar qualquer coisa.');
      } catch (err) { showFormError(f, msgErro(err)); setBusy(btn, false); }
    });
  }

  async function cancelarPedidoExclusao(btn) {
    setBusy(btn, true, 'Cancelando…');
    try { await DB.cancelarPedidoExclusao(); toast('Pedido de exclusão cancelado.'); }
    catch (err) { toast(msgErro(err), 'erro'); setBusy(btn, false); }
  }

  async function exportarDados(btn) {
    setBusy(btn, true, 'Preparando…');
    try {
      const dados = await DB.exportarDados();
      baixarArquivo(`${slug()}-dados-estokio-${hojeStr()}.json`, JSON.stringify(dados, null, 2), 'application/json');
      toast('Arquivo com os dados da empresa baixado.');
    } catch (err) { toast(msgErro(err), 'erro'); }
    finally { setBusy(btn, false); }
  }

  function baixarArquivo(nome, conteudo, tipo) {
    const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nome });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function baixarCSV(nome, linhas) {
    const cel = (v) => {
      let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
      if (/[;"\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const csv = '\uFEFF' + linhas.map((l) => l.map(cel).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: nome });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const hojeStr = () => new Date().toISOString().slice(0, 10);
  const slug = () => norm(state.empresa.nome).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'estokio';

  function exportarProdutos() {
    const lista = produtosFiltrados();
    if (!lista.length) return toast('Não há produtos para exportar.', 'erro');
    baixarCSV(`${slug()}-produtos-${hojeStr()}.csv`, [
      ['Produto', 'Código', 'Categoria', 'Unidade', 'Localização', 'Quantidade', 'Estoque mínimo', 'Situação', 'Custo (R$)', 'Venda (R$)', 'Valor em estoque (R$)'],
      ...lista.map((p) => [p.nome, p.sku, catName(p.categoriaId), p.unidade, p.localizacao, num(p.quantidade), num(p.estoqueMinimo),
        NIVEL_TXT[nivel(p)], num(p.custo), num(p.preco), Math.round(num(p.quantidade) * num(p.custo) * 100) / 100])
    ]);
    toast('Planilha de produtos exportada.');
  }

  function exportarMovs() {
    const lista = movsFiltradas();
    if (!lista.length) return toast('Não há movimentações para exportar.', 'erro');
    baixarCSV(`${slug()}-movimentacoes-${hojeStr()}.csv`, [
      ['Data', 'Produto', 'Código', 'Tipo', 'Quantidade', 'Saldo anterior', 'Saldo novo', 'Responsável', 'Observação', 'Local', 'Lotes'],
      ...lista.map((m) => [m.criadoEm ? df.format(m.criadoEm) : '', m.produtoNome, m.sku, TIPOS[m.tipo] || m.tipo, num(m.quantidade), num(m.antes), num(m.depois), nomeDe(m.usuario), m.observacao,
        m.tipo === 'transferencia' ? `${m.deNome || ''} > ${m.paraNome || ''}` : (m.localNome || ''),
        (m.lotes || []).map((l) => `${l.lote}${l.validade ? ` (${dfd.format(l.validade)})` : ''}: ${l.quantidade}`).join('; ')])
    ]);
    toast('Planilha de movimentações exportada.');
  }

  /* ================= autenticação ================= */
  let authMode = 'login';
  const AUTH_TXT = {
    login: { t: 'Entrar no Estokio', b: 'Entrar' },
    register: { t: 'Criar sua conta', b: 'Criar conta' },
    reset: { t: 'Recuperar senha', b: 'Enviar link de recuperação' }
  };

  function setAuthMode(mode) {
    authMode = mode;
    const f = $('#f-auth');
    $('#auth-title').textContent = AUTH_TXT[mode].t;
    $('#auth-submit').textContent = AUTH_TXT[mode].b;
    $$('[data-only]', f).forEach((el) => { el.hidden = el.dataset.only !== mode; });
    $$('[data-hide]', f).forEach((el) => { el.hidden = el.dataset.hide === mode; });
    $$('.auth-tabs [data-auth-mode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.authMode === mode)));
    f.senha.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
    $('#auth-convite').hidden = !(mode === 'register' && f.codigo.value);
    $('#auth-error').hidden = true; $('#auth-ok').hidden = true;
  }

  $('#auth').addEventListener('click', (e) => {
    const b = e.target.closest('[data-auth-mode]');
    if (b) setAuthMode(b.dataset.authMode);
  });
  $('#f-auth').codigo.addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
  document.addEventListener('change', (e) => { const sel = e.target.closest && e.target.closest('[data-papel-de]'); if (sel) mudarPapel(sel.dataset.papelDe, sel.value); });

  $('#f-auth').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const email = f.email.value.trim(), senha = f.senha.value, nome = f.nome.value.trim();
    const codigo = DB.normalizarCodigo(f.codigo.value);
    const err = $('#auth-error'), ok = $('#auth-ok');
    err.hidden = true; ok.hidden = true;
    const falha = (m) => { err.textContent = m; err.hidden = false; };
    if (authMode === 'register') {
      // Código só existe quando a pessoa veio por um link de convite; se estiver incompleto, segue sem ele
      if (f.codigo.value.trim() && !/^(EST|EQP)-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codigo)) f.codigo.value = '';
      if (!nome) return falha('Informe seu nome.');
      if (!f.termos.checked) return falha('Para criar a conta, você precisa marcar que aceita os termos, listados logo abaixo.');
    }
    if (!email) return falha('Informe seu e-mail.');
    if (authMode !== 'reset' && senha.length < 6) return falha('A senha precisa ter pelo menos 6 caracteres.');
    const btn = $('#auth-submit');
    setBusy(btn, true, 'Aguarde…');
    try {
      if (authMode === 'login') await DB.login(email, senha);
      else if (authMode === 'register') {
        state.codigoPendente = f.codigo.value.trim() ? codigo : null; state.nomePendente = nome;
        await DB.register(nome, email, senha, TERMOS_VERSAO);
      } else { await DB.resetPassword(email); ok.textContent = `Enviamos um link de recuperação para ${email}.`; ok.hidden = false; }
    } catch (x) { state.codigoPendente = null; falha(msgErro(x)); }
    finally { setBusy(btn, false); }
  });

  /* ================= sessão ================= */
  function pararDados() {
    state.unsubDados.forEach((u) => { try { u && u(); } catch (e) { /* ignora */ } });
    state.unsubDados = [];
    state.produtos = []; state.movs = []; state.cats = []; state.membros = []; state.convites = []; state.fornecedores = []; state.notas = []; state.locais = []; state.grades = [];
    state.solicitacoes = []; state.pedidosCompra = []; state.inventarios = [];
    state.loaded = {};
  }

  function encerrarSessao() {
    pararDados();
    state.unsubSessao.forEach((u) => { try { u && u(); } catch (e) { /* ignora */ } });
    state.unsubSessao = [];
    state.perfil = null; state.empresa = null; state.tela = null;
    Object.assign(state, { planos: [], config: {}, pedidos: [], esc: null, loadedCatalogo: false, pedidosOn: false });
    closeModal();
  }

  function iniciarDados() {
    pararDados();
    DB.configurarCustos(pode('verCusto'));
    if (DB.mode === 'firebase' && pode('verCusto') && !vencido(state.empresa)) {
      DB.sondarRegras().then((r) => { state.regrasAntigas = r === 'negado'; atualizarAvisoRegras(); });
    }
    const onErr = (e) => { if (e.code !== 'permission-denied') toast(msgErro(e), 'erro'); };
    const ouvir = (nome, chave) => DB.subscribe(nome, (l) => {
      state[chave] = l; state.loaded[nome] = true;
      if (nome === 'locais') { const pad = l.find((x) => x.padrao) || l[0]; DB.setLocalPadrao(pad ? pad.id : null); }
      if (nome === 'categorias' && state.route === 'produtos') render();
      else if (nome === 'locais' && state.route === 'locais') render(); // botões do topo dependem da quantidade de locais
      else if (nome === 'membros') { atualizarLateral(); refresh(); }
      else refresh();
      atualizarBadgeCompras();
    }, onErr);
    state.unsubDados.push(
      ouvir('produtos', 'produtos'),
      ouvir('categorias', 'cats'),
      ouvir('movimentacoes', 'movs'),
      ouvir('membros', 'membros'),
      ouvir('fornecedores', 'fornecedores'),
      ouvir('notas', 'notas'),
      ouvir('locais', 'locais'),
      ouvir('grades', 'grades'),
      ouvir('pedidosCompra', 'pedidosCompra')
    );
    if (pode('gerir')) state.unsubDados.push(ouvir('solicitacoes', 'solicitacoes'));
    if (recurso('lotes')) state.unsubDados.push(ouvir('inventarios', 'inventarios'));
    if (ehDono()) {
      state.unsubDados.push(DB.watchConvitesEquipe((l) => { state.convites = l; state.loaded.convites = true; refresh(); }, onErr));
    }
  }

  function abrirShell() {
    state.tela = 'shell';
    closeModal();
    mostrar('shell');
    $('#btn-logout').hidden = DB.mode === 'local';
    $('#demo-banner').hidden = DB.mode !== 'local';
    if (DB.apresentacao) {
      const faixa = $('#demo-banner');
      faixa.classList.add('is-apresentacao');
      faixa.innerHTML = `<span><strong>Demonstração do Estokio</strong> com dados fictícios. Mexa à vontade.</span>
        <button class="link-btn" data-action="recomecar-demo">Recomeçar</button>
        <a class="btn btn-sm faixa-entrar" href="${urlEntrar()}">Entrar</a>
        <a class="btn btn-primary btn-sm" href="${urlCadastro()}">Criar minha conta grátis</a>`;
    }
    atualizarLateral();
    atualizarAviso();
    iniciarDados();
    route();
    registrarAcesso();
    if (embutido) { /* miniatura da página inicial: sem janelas */ }
    else if (DB.apresentacao) setTimeout(boasVindasApresentacao, 400);
    else if (state.route === 'painel') setTimeout(boasVindas, 400);
  }

  function registrarAcesso() {
    const chave = `estokio:acesso:${state.user.uid}`;
    try {
      const ultimo = Number(localStorage.getItem(chave) || 0);
      if (Date.now() - ultimo < 6 * 3600e3) return;
      localStorage.setItem(chave, String(Date.now()));
    } catch (e) { /* sem armazenamento: registra mesmo assim */ }
    DB.registrarAcesso(state.user.uid).catch(() => {});
  }

  /** Decide qual tela mostrar a partir do estado da empresa. */
  function processarEmpresa(emp) {
    const eraDono = ehDono();
    const estavaBloqueada = state.tela === 'vencida';
    state.empresa = emp;
    Marca.aplicar(emp);
    if (ehDono() && !state.pedidosOn) {
      state.pedidosOn = true;
      state.unsubSessao.push(DB.watchPedidos((l) => { state.pedidos = l; atualizarEscolhas(); }, () => {}));
    }
    if (emp.ativo === false) {
      pararDados();
      return telaMensagem('Acesso suspenso', `O acesso de <strong>${esc(emp.nome)}</strong> ao Estokio está suspenso. Fale com o suporte do Estokio para reativar.`);
    }
    if (vencido(emp)) {
      if (state.tela !== 'vencida') { pararDados(); telaVencida(); }
      return;
    }
    if (ehDono() && !emp.configurado) {
      if (state.tela !== 'setup') { pararDados(); telaSetup(); }
      return;
    }
    if (state.tela !== 'shell' || eraDono !== ehDono()) {
      abrirShell();
      if (estavaBloqueada) { state.esc = null; toast('Pagamento confirmado. Sistema liberado, obrigado!'); }
    } else { atualizarLateral(); atualizarAviso(); document.title = `${ROUTES[state.route].titulo} | ${emp.nome}`; refresh(); }
  }

  // Confere o vencimento a cada minuto (o app pode ficar aberto o dia todo)
  setInterval(() => {
    if (!state.empresa || state.tela !== 'shell') return;
    if (vencido(state.empresa)) processarEmpresa(state.empresa);
    else atualizarAviso();
  }, 60e3);

  function abrirEmpresa(perfil) {
    state.perfil = perfil;
    DB.setEmpresa(perfil.empresaId);
    let membroVisto = false;
    const perdeuAcesso = () => {
      encerrarSessao();
      Marca.limpar();
      telaMensagem('Seu acesso foi removido', 'Esta conta não faz mais parte da equipe desta empresa. Para voltar, peça um novo código de convite ao responsável.');
    };

    let prontos = 0;
    const catalogo = () => { if (++prontos >= 2) { state.loadedCatalogo = true; } atualizarEscolhas(); };
    state.unsubSessao.push(
      DB.watchPlanos((l) => { state.planos = l; catalogo(); }, () => {}),
      DB.watchConfig((c) => { state.config = c || {}; catalogo(); }, () => {}),
      DB.watchEmpresa((emp) => {
        if (!emp) return perdeuAcesso();
        processarEmpresa(emp);
      }, (err) => { if (err.code === 'permission-denied') perdeuAcesso(); else telaMensagem('Não foi possível carregar a empresa', esc(msgErro(err))); }),

      DB.watchMembro(state.user.uid, (m) => {
        if (m) {
          membroVisto = true;
          const novo = m.papel === 'dono' ? 'dono' : normPapel(m.papel);
          const antes = state.meuPapel;
          state.meuPapel = novo;
          if (antes && antes !== novo && state.tela === 'shell') { iniciarDados(); render(); atualizarLateral(); toast(`Seu papel agora é ${PAPEIS[novo]}.`); }
        } else if (membroVisto) perdeuAcesso();
      }, (err) => { if (err.code === 'permission-denied' && membroVisto) perdeuAcesso(); })
    );
  }

  // Módulos de recursos: cada um recebe a API do app e devolve rotas, telas, ações e ganchos
  const API = {
    state, DB, Ass, $, $$, esc, num, norm, nf, cf, df, dfd, plural, icon, ICONS, openModal, closeModal, modalHead, toast, setBusy,
    showFormError, confirmar, emptyState, loading, refresh, render, sortedProds, sortedCats, sortedForn, prodById, catName, fornById,
    baixarCSV, baixarArquivo, hojeStr, slug, gauge, nivel, movementForm, productForm, recurso, ehDono, cardBloqueado, planoQueLibera, gruposCompra, aCaminho, fmtFone,
    digitos, semZeros, prodPorCodigo, mediaDia, acabaEm, copiar, msgErro, detalheMov, TIPOS,
    pode, meuPapel, ehKit, kitDisponivel, precisaRepor, nomeDe, waNumero, NIVEL_TXT, Prev, avaliar, prazoDe, mediaDia, textoPrazo
  };
  MODULOS = (window.EstokioModulos || []).map((f) => { try { return f(API); } catch (e) { console.error('Módulo com erro:', e); return null; } }).filter(Boolean);
  MODULOS.forEach((mod) => {
    Object.assign(ROUTES, mod.rotas || {});
    Object.assign(views, mod.views || {});
    Object.assign(ACOES_MOD, mod.acoes || {});
    Object.assign(ICONS, mod.icones || {});
  });

  // Ícones fixos do HTML
  $$('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon); });

  let sessao = 0;
  DB.onAuth(async (user) => {
    const s = ++sessao;
    encerrarSessao();
    state.user = user;
    if (!user) {
      const url = new URLSearchParams(location.search);
      let pediuLogin = false;
      try { pediuLogin = Boolean(sessionStorage.getItem('estokio:mostrarLogin')); } catch (e) { /* ignora */ }
      const querAcesso = url.has('entrar') || url.has('cadastro') || url.has('codigo') || pediuLogin || state.codigoPendente;
      // Tela inicial de quem não está logado: 'site' (página de apresentação), 'demo' ou 'login'.
      // No app Android (Capacitor) não existe a página de apresentação: vai direto ao login.
      let inicial = window.ESTOKIO_TELA_INICIAL || (window.ESTOKIO_DEMO_NA_ENTRADA === false ? 'login' : 'site');
      if (window.Capacitor) inicial = 'login';
      if (DB.mode === 'firebase' && !querAcesso && inicial !== 'login') {
        location.replace(inicial === 'demo' ? `${location.pathname}?demo=1${location.hash || ''}` : new URL('../index.html', location.href).href);
        return;
      }
      Marca.limpar();
      state.tela = 'auth';
      mostrar('auth');
      const codigoUrl = url.get('codigo');
      if (codigoUrl && !$('#f-auth').codigo.value) $('#f-auth').codigo.value = DB.normalizarCodigo(codigoUrl);
      const cod = $('#f-auth').codigo.value;
      const aviso = $('#auth-convite');
      aviso.hidden = !cod;
      if (cod) aviso.innerHTML = cod.startsWith('EQP')
        ? `Você recebeu um <strong>convite para uma equipe</strong>. Crie a sua conta e o convite <strong>${esc(cod)}</strong> é aplicado na hora.`
        : `Você recebeu o código de ativação <strong>${esc(cod)}</strong>. Crie a sua conta e ele é aplicado na hora.`;
      setAuthMode(state.codigoPendente || url.has('cadastro') || codigoUrl ? 'register' : 'login');
      return;
    }
    try { sessionStorage.removeItem('estokio:mostrarLogin'); } catch (e) { /* ignora */ }
    if (!user.name && state.nomePendente) user.name = state.nomePendente;
    telaCarregando();
    // Um login só: a conta do administrador master vai para o painel admin
    if (await DB.ehAdmin(user.uid)) {
      if (s === sessao) location.replace(new URL('../admin/index.html', location.href).href);
      return;
    }
    try {
      const perfil = await DB.getPerfil(user.uid);
      if (s !== sessao) return;
      if (!perfil) return telaAtivar();
      abrirEmpresa(perfil);
    } catch (e) {
      if (s === sessao) telaMensagem('Não foi possível carregar sua conta', esc(msgErro(e)));
    }
  });
})();
