/*
 * Estokio Admin — painel do administrador master.
 * Fica FORA da pasta www/: não vai para a hospedagem nem para o app desktop/Android.
 * Abra direto no navegador (dois cliques em admin/index.html).
 *
 * Acesso: a conta precisa existir no Firebase Authentication E ter um documento
 * admins/{uid} no Firestore (criado à mão no console).
 *
 * Seções: Empresas (lista e detalhe), Financeiro, Planos, Histórico e Configurações.
 * Toda ação que altera dados grava um registro imutável em auditoria/.
 */
(function () {
  'use strict';

  const DIA = 864e5;
  const MAX_USUARIOS_PADRAO = 5;
  const SEM_USO_DIAS = 15;
  const FORMAS = ['Pix', 'Boleto', 'Cartão', 'Transferência', 'Dinheiro', 'Cortesia'];
  const RECURSOS = window.EstokioAssinatura.RECURSOS.map((k) => ({ k, nome: window.EstokioAssinatura.NOMES_RECURSOS[k] }));
  // Recursos que o plano não menciona ficam desligados (lotes, grade, multiloja, relatórios, etiquetas, integração)
  const TODOS_RECURSOS = { ...window.EstokioAssinatura.BASE };
  // Nomes dos pacotes antigos, só para mostrar quem ainda os tem
  const PACOTES_ANTIGOS = { fiscal: 'Fiscal', equipe: 'Equipe+', lotes: 'Validade e lotes', grade: 'Grade', multiloja: 'Multiloja', relatorios: 'Relatórios', etiquetas: 'Etiquetas' };
  const cfg = window.ESTOKIO_FIREBASE_CONFIG || {};
  const Ass = window.EstokioAssinatura;
  const Pix = window.EstokioPix;

  /* ================= utilitários ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const dfd = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
  const df = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const mesCurto = new Intl.DateTimeFormat('pt-BR', { month: 'short' });
  const rotuloMes = (ms) => `${mesCurto.format(ms).replace('.', '')}/${String(new Date(ms).getFullYear()).slice(2)}`;
  const cf = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const toMs = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : 0);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const digitos = (s) => String(s || '').replace(/\D/g, '');
  const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'empresa';
  const hojeStr = () => new Date().toISOString().slice(0, 10);
  const logoSeguro = (u) => (typeof u === 'string' && /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/.test(u) ? u : '');
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
  const diasAte = (ms) => Math.ceil((ms - Date.now()) / DIA);
  const quandoFoi = (ms) => {
    if (!ms) return 'Nunca';
    const d = Math.floor((Date.now() - ms) / DIA);
    if (d <= 0) return 'Hoje';
    if (d === 1) return 'Ontem';
    return `Há ${d} dias`;
  };

  function mostrar(id) { ['a-login', 'a-msg', 'a-app'].forEach((x) => { $('#' + x).hidden = x !== id; }); }
  function mensagem(titulo, texto, comSair) {
    $('#a-msg').innerHTML = `<div class="gate-card">
      <div class="gate-brand"><img class="logo-estokio" src="../app/assets/estokio-logo.svg" alt="Estokio"><span class="a-sufixo">Admin</span></div>
      <h1>${titulo}</h1><p>${texto}</p>
      ${comSair ? '<button class="btn btn-block" data-action="sair">Sair</button>' : ''}</div>`;
    mostrar('a-msg');
  }

  if (!cfg.apiKey || !cfg.projectId || !window.firebase) {
    mensagem('Firebase não configurado', 'Preencha <code>www/js/firebase-config.js</code> com os dados do seu projeto e abra esta página de novo. Se já preencheu, confira a conexão com a internet.');
    return;
  }

  firebase.initializeApp(cfg);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const FV = firebase.firestore.FieldValue;
  const TS = firebase.firestore.Timestamp;

  const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  function gerarCodigo(prefixo) {
    const b = new Uint8Array(12); crypto.getRandomValues(b);
    let s = '';
    for (let i = 0; i < 12; i++) { s += ALFABETO[b[i] % 32]; if (i === 3 || i === 7) s += '-'; }
    return `${prefixo}-${s}`;
  }

  const state = {
    empresas: [], convites: [], planos: [], cobrancas: [], config: {}, pedidos: [], configAntiga: {},
    unsub: [], rota: 'empresas', param: null,
    q: '', filtro: '', hq: '',
    det: null, historico: null
  };

  /* ================= toasts, modais, arquivos ================= */
  function toast(msg, tipo = 'ok') {
    const el = document.createElement('div');
    el.className = `toast toast-${tipo}`; el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 250); }, 3600);
  }
  function openModal(html, wide) {
    $('#modal-root').innerHTML = `<div class="backdrop"><div class="modal${wide ? ' modal-wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
    const m = $('#modal-root .modal');
    const f = m.querySelector('[autofocus]') || m.querySelector('input:not([type=checkbox]), select, textarea, button');
    if (f) setTimeout(() => f.focus(), 20);
    return m;
  }
  const closeModal = () => { $('#modal-root').innerHTML = ''; };
  $('#modal-root').addEventListener('mousedown', (e) => { if (e.target.classList.contains('backdrop')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  const head = (t) => `<header class="modal-head"><h2>${t}</h2><button type="button" class="icon-btn" data-action="fechar" aria-label="Fechar">✕</button></header>`;
  const erroForm = (f, msg) => { const p = f.querySelector('.form-error'); p.textContent = msg; p.hidden = !msg; };

  function confirmar(titulo, texto, ok, perigo = true) {
    return new Promise((resolve) => {
      const m = openModal(`${head(titulo)}<div class="modal-body"><p class="confirm-text">${texto}</p></div>
        <footer class="modal-foot"><button class="btn" data-r="0">Cancelar</button><button class="btn ${perigo ? 'btn-danger' : 'btn-primary'}" data-r="1" autofocus>${ok}</button></footer>`);
      m.addEventListener('click', (e) => {
        const b = e.target.closest('[data-r],[data-action="fechar"]');
        if (!b) return; e.stopPropagation(); closeModal(); resolve(b.dataset.r === '1');
      });
    });
  }

  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); toast('Copiado.'); }
    catch (e) {
      const t = Object.assign(document.createElement('textarea'), { value: texto });
      document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); toast('Copiado.');
    }
  }
  function baixar(nome, conteudo, tipo) {
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
    baixar(nome, '\uFEFF' + linhas.map((l) => l.map(cel).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  }

  const ERROS = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/invalid-login-credentials': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
    'auth/network-request-failed': 'Sem conexão com a internet.',
    'permission-denied': 'O Firestore recusou a operação. Confira se as regras (firestore.rules) atualizadas foram publicadas e se sua conta está em admins.'
  };
  const msgErro = (e) => ERROS[e && e.code] || (e && e.message) || 'Algo deu errado.';

  /* ================= histórico de ações (auditoria) ================= */
  const ACOES = {
    criar_empresa: 'Cadastrou empresa',
    gerar_codigo: 'Gerou código de ativação',
    gerar_renovacao: 'Gerou código de renovação',
    convite_equipe: 'Gerou convite de equipe',
    pagamento: 'Registrou pagamento',
    cancelar_cobranca: 'Cancelou cobrança',
    lembrete: 'Enviou lembrete de cobrança',
    suspender: 'Suspendeu empresa',
    reativar: 'Reativou empresa',
    vencimento: 'Ajustou vencimento',
    limite: 'Mudou limite de usuários',
    plano: 'Trocou plano',
    contato: 'Editou dados de contato',
    transferir: 'Transferiu responsável',
    remover_usuario: 'Removeu usuário',
    exportar: 'Exportou dados (LGPD)',
    excluir_empresa: 'Excluiu empresa e dados (LGPD)',
    plano_criar: 'Criou plano',
    plano_editar: 'Editou plano',
    config: 'Alterou configurações',
    confirmar_pedido: 'Confirmou pagamento Pix',
    recusar_pedido: 'Recusou pedido Pix',
    pacotes: 'Alterou pacotes da empresa',
    pacote_criar: 'Criou pacote',
    pacote_editar: 'Editou pacote',
    padroes: 'Criou planos padrão',
    plano_ativo: 'Ativou ou desativou um plano antigo'
  };
  function registrar(batch, acao, emp, detalhes) {
    batch.set(db.collection('auditoria').doc(), {
      acao, empresaId: emp ? emp.id : null, empresaNome: emp ? emp.nome : null, detalhes: detalhes || '',
      adminUid: auth.currentUser.uid, adminEmail: auth.currentUser.email, criadoEm: FV.serverTimestamp()
    });
  }
  /** Executa as gravações de `fn` num lote junto com o registro no histórico. */
  async function comLog(acao, emp, detalhes, fn) {
    const b = db.batch();
    if (fn) fn(b);
    registrar(b, acao, emp, detalhes);
    await b.commit();
    state.historico = null;
  }

  /* ================= login ================= */
  $('#f-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    erroForm(f, '');
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try { await auth.signInWithEmailAndPassword(f.email.value.trim(), f.senha.value); }
    catch (x) { erroForm(f, msgErro(x)); }
    finally { btn.disabled = false; }
  });

  // Um login só: o painel usa o login do gestor (app). Sem login, vai para lá; quem não é admin volta para a própria empresa.
  const irParaApp = (q) => location.replace(new URL(`../app/index.html${q || ''}`, location.href).href);
  auth.onAuthStateChanged(async (u) => {
    state.unsub.forEach((f) => f()); state.unsub = [];
    if (!u) { irParaApp('?entrar=1'); return; }
    mensagem('Verificando acesso…', 'Um instante.');
    try {
      const adm = await db.collection('admins').doc(u.uid).get();
      if (!adm.exists) { irParaApp(''); return; }
    } catch (x) { mensagem('Não foi possível verificar o acesso', esc(msgErro(x)), true); return; }
    $('#a-email').textContent = u.email;
    mostrar('a-app');
    iniciar();
  });

  function iniciar() {
    const onErr = (e) => toast(msgErro(e), 'erro');
    const lista = (s) => s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
    state.unsub.push(
      db.collection('empresas').onSnapshot((s) => { state.empresas = lista(s); render(); }, onErr),
      db.collection('convites').where('status', '==', 'pendente').onSnapshot((s) => { state.convites = lista(s); render(); }, onErr),
      db.collection('planos').onSnapshot((s) => { state.planos = lista(s); render(); }, onErr),
      db.collection('cobrancas').onSnapshot((s) => { state.cobrancas = lista(s); render(); }, onErr),
      db.collection('pedidos').where('status', '==', 'aguardando').onSnapshot((s) => { state.pedidos = lista(s); render(); }, onErr),
      // config/publico é lida pelo app (chave Pix, WhatsApp); config/cobranca é da versão anterior
      db.collection('config').doc('publico').onSnapshot((s) => { state.config = { ...state.configAntiga, ...(s.exists ? s.data() : {}) }; render(); }, onErr),
      db.collection('config').doc('cobranca').onSnapshot((s) => { state.configAntiga = s.exists ? s.data() : {}; state.config = { ...state.configAntiga, ...state.config }; }, () => {})
    );
    rota();
  }

  /* ================= dados derivados ================= */
  const urlApp = () => state.config.urlApp || (cfg.projectId ? `https://${cfg.projectId}.web.app` : '');
  /** Link que abre o Estokio em "Criar conta" com o código já preenchido. */
  const linkCodigo = (codigo) => (urlApp() ? `${urlApp().replace(/\/+$/, '')}/?codigo=${codigo}` : '');
  const empById = (id) => state.empresas.find((e) => e.id === id);
  /** Catálogo em uso: o salvo no Firestore, ou o padrão enquanto o admin ainda não o criou. */
  const catalogo = () => Ass.catalogo(state.planos);
  const planoById = (id) => catalogo().find((p) => p.id === id) || state.planos.find((p) => p.id === id);
  const planosVenda = () => Ass.planosVendaveis(catalogo());
  const periodoDe = (e) => Ass.periodoDe(e.planoPeriodo) || Ass.periodoPorDias(e.planoDias);
  const emTeste = (e) => e.planoId === 'teste';
  function situacao(e) {
    if (e.ativo === false) return 'suspensa';
    if (!e.donoUid) return 'aguardando';
    const venceu = toMs(e.acessoAte) && toMs(e.acessoAte) <= Date.now();
    if (emTeste(e)) return venceu ? 'testefim' : 'teste';
    return venceu ? 'vencida' : 'ativa';
  }
  const SIT_TXT = { aguardando: 'Aguardando ativação', ativa: 'Ativa', vencida: 'Vencida', suspensa: 'Suspensa', teste: 'Em teste grátis', testefim: 'Teste encerrado' };
  const ultimo = (lista) => lista.sort((a, b) => toMs(b.criadoEm) - toMs(a.criadoEm))[0];
  const conviteDe = (eid, tipo) => ultimo(state.convites.filter((c) => c.empresaId === eid && c.tipo === tipo));
  const cobrancasDe = (eid) => state.cobrancas.filter((c) => c.empresaId === eid).sort((a, b) => toMs(b.criadoEm) - toMs(a.criadoEm));
  const semUso = (e) => situacao(e) === 'ativa' && (!toMs(e.ultimoAcesso) || Date.now() - toMs(e.ultimoAcesso) > SEM_USO_DIAS * DIA);
  const vencendo = (e, dias = 7) => ['ativa', 'vencida'].includes(situacao(e)) && toMs(e.acessoAte) && diasAte(toMs(e.acessoAte)) <= dias;
  const podeCobrar = (e) => vencendo(e) || situacao(e) === 'testefim' || (situacao(e) === 'teste' && diasAte(toMs(e.acessoAte)) <= 2);
  /** Valor esperado da próxima renovação: plano e período atuais, senão a última cobrança. */
  function valorRenovacao(e) {
    const p = planoById(e.planoId);
    if (emTeste(e)) {
      const ref = planosVenda().find((x) => x.destaque) || planosVenda()[0];
      return { valor: ref ? Ass.preco(ref, 'mensal') : 0, dias: 30, plano: ref ? ref.nome : '' };
    }
    const per = periodoDe(e);
    if (p && Ass.ehNivel(p) && per) return { valor: Ass.preco(p, per.id), dias: per.dias, plano: `${p.nome}, ${per.nome.toLowerCase()}` };
    if (p && Ass.ehLegado(p)) return { valor: num(p.preco), dias: num(p.dias) || 30, plano: p.nome };
    const c = cobrancasDe(e.id).find((x) => x.status !== 'cancelado');
    return { valor: c ? num(c.valor) : num(e.planoPreco), dias: c ? num(c.dias) : 30, plano: e.planoNome || '' };
  }
  /** Campos da empresa para um plano e um período. */
  const camposPlano = (p, periodoId) => Ass.aplicar(p, periodoId);
  const telefoneDe = (e) => e.contatoTelefone || e.telefone || '';

  /* ================= navegação ================= */
  function rota() {
    const partes = (location.hash.replace(/^#\/?/, '') || 'empresas').split('/');
    state.rota = ['empresas', 'empresa', 'financeiro', 'planos', 'historico', 'config'].includes(partes[0]) ? partes[0] : 'empresas';
    state.param = partes[1] || null;
    if (state.rota === 'empresa' && (!state.det || state.det.id !== state.param)) carregarDetalhe(state.param);
    if (state.rota === 'historico' && !state.historico) carregarHistorico();
    render();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', rota);

  function render() {
    if ($('#a-app').hidden) return;
    $$('.a-nav a').forEach((a) => a.classList.toggle('active', a.dataset.rota === (state.rota === 'empresa' ? 'empresas' : state.rota)));
    const badge = $('#badge-pedidos');
    if (badge) { const n = pedidosPendentes().length; badge.hidden = !n; badge.textContent = n; }
    const v = { empresas: viewEmpresas, empresa: viewEmpresa, financeiro: viewFinanceiro, planos: viewPlanos, historico: viewHistorico, config: viewConfig }[state.rota];
    const alvo = $('#a-conteudo');
    // Preserva o foco e o texto da busca ao redesenhar
    const ativo = document.activeElement && document.activeElement.id;
    const pos = ativo && document.activeElement.selectionStart;
    alvo.innerHTML = v();
    if (ativo && $('#' + ativo)) { const el = $('#' + ativo); el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) { /* ignora */ } }
  }

  const chipSit = (e) => `<span class="status st-${situacao(e)}">${SIT_TXT[situacao(e)]}</span>`;
  const logoEmp = (e) => {
    const logo = logoSeguro(e.logo);
    return `<span class="emp-logo" style="background:${esc(e.corPrimaria || '#16233A')};color:${esc(e.corDestaque || '#F2B705')}">${logo ? `<img src="${esc(logo)}" alt="">` : esc((e.nome || '?').slice(0, 2).toUpperCase())}</span>`;
  };
  const txtAcesso = (e) => {
    const ate = toMs(e.acessoAte);
    if (situacao(e) === 'aguardando') return '<span class="muted">Após ativar</span>';
    if (!ate) return '<span class="muted">Sem vencimento</span>';
    const d = diasAte(ate);
    return `<span class="p-name">${dfd.format(ate)}</span><span class="p-sku ${d <= 7 ? 'venc-alerta' : ''}">${d > 0 ? `Faltam ${plural(d, 'dia', 'dias')}` : `Venceu há ${plural(1 - d, 'dia', 'dias')}`}</span>`;
  };

  /* ================= EMPRESAS ================= */
  function viewEmpresas() {
    const es = state.empresas;
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
    const recebidoMes = state.cobrancas.filter((c) => c.status === 'pago' && toMs(c.pagoEm) >= inicioMes.getTime()).reduce((s, c) => s + num(c.valor), 0);
    const ativas = es.filter((e) => situacao(e) === 'ativa').length;
    const testes = es.filter((e) => situacao(e) === 'teste').length;
    const vieramTeste = es.filter((e) => e.origem === 'teste');
    const convertidas = vieramTeste.filter((e) => !emTeste(e)).length;
    const pend = pedidosPendentes();
    const venc = es.filter((e) => vencendo(e)).length;
    const parados = es.filter(semUso).length;

    const qq = norm(state.q);
    const lista = es
      .filter((e) => !qq || norm(`${e.nome} ${e.cnpj} ${e.donoEmail} ${e.contatoEmail} ${e.contatoNome} ${e.planoNome}`).includes(qq))
      .filter((e) => !state.filtro || (state.filtro === 'semuso' ? semUso(e) : state.filtro === 'vencendo' ? vencendo(e) : situacao(e) === state.filtro))
      .sort((a, b) => toMs(b.criadoEm) - toMs(a.criadoEm));

    return `
      <div class="topbar"><h1>Empresas</h1><div class="topbar-actions"><button class="btn btn-primary" data-action="nova-empresa">Cadastrar empresa</button></div></div>
      <section class="stats" aria-label="Resumo">
        <div class="stat"><span class="stat-label">Empresas pagantes</span><strong class="stat-value">${ativas}</strong><span class="stat-sub">${es.length} cadastradas no total${parados ? `, ${parados} sem uso há ${SEM_USO_DIAS} dias` : ''}</span></div>
        <div class="stat"><span class="stat-label">Em teste grátis</span><strong class="stat-value">${testes}</strong><span class="stat-sub">${vieramTeste.length ? `${convertidas} de ${vieramTeste.length} testes viraram pagantes (${Math.round((convertidas / vieramTeste.length) * 100)}%)` : 'Nenhum teste ainda'}</span></div>
        <div class="stat ${venc ? 'is-alert' : ''}"><span class="stat-label">Vencem em até 7 dias</span><strong class="stat-value">${venc}</strong><span class="stat-sub">Inclui as já vencidas</span></div>
        <div class="stat"><span class="stat-label">Recebido neste mês</span><strong class="stat-value">${cf.format(recebidoMes)}</strong><span class="stat-sub"><a class="link-btn" href="#/financeiro">Ver financeiro</a></span></div>
      </section>
      ${pend.length ? `<a class="alerta-pedidos" href="#/financeiro"><strong>${plural(pend.length, 'pagamento Pix aguardando', 'pagamentos Pix aguardando')} sua confirmação</strong><span>Confira no banco e libere as empresas em Financeiro</span></a>` : ''}
      <div class="toolbar">
        <label class="search"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/></svg>
          <input type="search" id="a-busca" value="${esc(state.q)}" placeholder="Buscar por empresa, CNPJ, e-mail ou plano" aria-label="Buscar empresas"></label>
        <select id="a-filtro" aria-label="Filtrar">
          ${[['', 'Todas as situações'], ['teste', 'Em teste grátis'], ['testefim', 'Teste encerrado, sem pagar'], ['aguardando', 'Aguardando ativação'], ['ativa', 'Pagantes ativas'], ['vencendo', 'Vencem em até 7 dias'], ['vencida', 'Vencidas'], ['semuso', `Sem uso há ${SEM_USO_DIAS} dias`], ['suspensa', 'Suspensas']]
            .map(([v, t]) => `<option value="${v}" ${state.filtro === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      ${!es.length ? `<div class="empty"><div class="empty-art" aria-hidden="true"><span></span><span></span><span></span></div>
        <h2>Nenhuma empresa cadastrada</h2><p>Cadastre a primeira empresa para gerar o código de ativação que você envia ao cliente.</p>
        <button class="btn btn-primary" data-action="nova-empresa">Cadastrar empresa</button></div>`
      : !lista.length ? '<p class="no-results">Nenhuma empresa corresponde à busca.</p>'
      : `<div class="table-wrap"><table class="table">
        <thead><tr><th>Empresa</th><th>Situação</th><th>Plano</th><th>Acesso até</th><th>Último uso</th><th>Código pendente</th><th><span class="sr-only">Ações</span></th></tr></thead>
        <tbody>${lista.map((e) => {
          const sit = situacao(e);
          const c = conviteDe(e.id, sit === 'aguardando' ? 'empresa' : 'renovacao');
          const ua = toMs(e.ultimoAcesso);
          return `<tr class="linha-link" data-abrir="${e.id}">
            <td><div class="emp-cell">${logoEmp(e)}<div><a class="p-name emp-link" href="#/empresa/${e.id}">${esc(e.nome)}</a><span class="p-sku">${esc(e.donoEmail || e.contatoNome || e.contatoEmail || '')}</span></div></div></td>
            <td>${chipSit(e)}</td>
            <td><span class="p-name">${esc(e.planoNome) || '<span class="muted">Sem plano</span>'}</span><span class="p-sku">${num(e.totalUsuarios)} de ${num(e.maxUsuarios) || MAX_USUARIOS_PADRAO} usuários</span></td>
            <td class="nowrap">${txtAcesso(e)}</td>
            <td class="nowrap">${sit === 'aguardando' ? '<span class="muted">Ainda não usou</span>' : `<span class="${semUso(e) ? 'venc-alerta' : ''}">${quandoFoi(ua)}</span>`}</td>
            <td>${c ? `<span class="code-chip">${esc(c.id)}</span><span class="p-sku">${c.tipo === 'renovacao' ? `+${c.dias} dias, ainda não aplicado` : `Ativação com ${c.dias || 30} dias`}</span>` : '<span class="muted">Nenhum</span>'}</td>
            <td><div class="a-actions">
              ${sit === 'aguardando'
                ? `<button class="btn btn-sm" data-action="codigo" data-tipo="empresa" data-id="${e.id}">Novo código</button>`
                : `<button class="btn btn-sm ${vencendo(e) ? 'btn-primary' : ''}" data-action="codigo" data-tipo="renovacao" data-id="${e.id}">Renovar</button>`}
              ${podeCobrar(e) ? `<button class="btn btn-sm" data-action="cobrar" data-id="${e.id}">Cobrar</button>` : ''}
            </div></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`}`;
  }

  /* ================= DETALHE DA EMPRESA ================= */
  async function contar(q) {
    try { if (typeof q.count === 'function') { const s = await q.count().get(); return s.data().count; } } catch (e) { /* cai no modo simples */ }
    return (await q.limit(5000).get()).size;
  }

  async function carregarDetalhe(id) {
    state.det = { id, carregando: true, membros: [], uso: null, hist: [] };
    const base = db.collection('empresas').doc(id);
    try {
      const [membros, hist] = await Promise.all([
        base.collection('membros').get(),
        db.collection('auditoria').where('empresaId', '==', id).limit(100).get()
      ]);
      if (!state.det || state.det.id !== id) return;
      state.det.membros = membros.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.det.hist = hist.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => toMs(b.criadoEm) - toMs(a.criadoEm));
      state.det.carregando = false;
      render();
      const [produtos, movs30, ultMov] = await Promise.all([
        contar(base.collection('produtos')),
        contar(base.collection('movimentacoes').where('criadoEm', '>=', TS.fromMillis(Date.now() - 30 * DIA))),
        base.collection('movimentacoes').orderBy('criadoEm', 'desc').limit(1).get()
      ]);
      if (!state.det || state.det.id !== id) return;
      state.det.uso = { produtos, movs30, ultimaMov: ultMov.empty ? null : toMs(ultMov.docs[0].data().criadoEm) };
      render();
    } catch (e) {
      if (state.det && state.det.id === id) { state.det.carregando = false; state.det.erro = msgErro(e); render(); }
    }
  }
  const recarregarDetalhe = () => { if (state.det) carregarDetalhe(state.det.id); };

  function viewEmpresa() {
    const e = empById(state.param);
    if (!e) return state.empresas.length ? '<p class="no-results">Empresa não encontrada. Ela pode ter sido excluída. <a class="link-btn" href="#/empresas">Voltar</a></p>' : '<div class="loading">Carregando…</div>';
    const D = state.det || {};
    const sit = situacao(e);
    const cobr = cobrancasDe(e.id);
    const conv = conviteDe(e.id, sit === 'aguardando' ? 'empresa' : 'renovacao');
    const conviteEq = state.convites.filter((c) => c.empresaId === e.id && c.tipo === 'membro');
    const max = num(e.maxUsuarios) || MAX_USUARIOS_PADRAO;
    const recursos = { ...TODOS_RECURSOS, ...(e.recursos || {}) };
    const uso = D.uso;

    return `
      <a class="link-btn voltar" href="#/empresas">← Todas as empresas</a>
      <div class="det-head">
        ${logoEmp(e)}
        <div class="det-tit"><h1>${esc(e.nome)}</h1><div class="det-sub">${chipSit(e)}${e.planoNome ? `<span class="chip st-atualizar">Plano ${esc(e.planoNome)}</span>` : ''}</div></div>
        <div class="det-acoes">
          ${sit === 'aguardando'
            ? `<button class="btn btn-primary" data-action="codigo" data-tipo="empresa" data-id="${e.id}">Novo código de ativação</button>`
            : `<button class="btn btn-primary" data-action="codigo" data-tipo="renovacao" data-id="${e.id}">Renovar</button>
               <button class="btn" data-action="cobrar" data-id="${e.id}">Cobrar</button>`}
          ${e.ativo === false
            ? `<button class="btn" data-action="ativo" data-valor="1" data-id="${e.id}">Reativar</button>`
            : `<button class="btn" data-action="ativo" data-valor="0" data-id="${e.id}">Suspender</button>`}
        </div>
      </div>

      <div class="det-grid">
        <section class="panel">
          <header class="panel-head"><h2>Acesso e plano</h2></header>
          <dl class="kv">
            <dt>Acesso até</dt><dd>${txtAcesso(e)}${sit !== 'aguardando' ? `<button class="link-btn" data-action="vencimento" data-id="${e.id}">Ajustar</button>` : ''}</dd>
            <dt>Plano</dt><dd>${e.planoNome ? `<span class="p-name">${esc(e.planoNome)}${periodoDe(e) && !emTeste(e) ? `, ${esc(periodoDe(e).nome.toLowerCase())}` : ''}${planoById(e.planoId) && Ass.ehLegado(planoById(e.planoId)) ? ' <span class="chip st-ignorar">plano antigo</span>' : ''}</span><span class="p-sku">${cf.format(num(e.planoPreco))}</span>` : '<span class="muted">Sem plano (recursos básicos)</span>'}<button class="link-btn" data-action="trocar-plano" data-id="${e.id}">Trocar</button></dd>
            ${Object.keys(e.pacotes || {}).length ? `<dt>Pacotes antigos</dt><dd>${Object.entries(e.pacotes).map(([id, q]) => `<span class="chip st-atualizar">${esc(PACOTES_ANTIGOS[id] || id)}${q > 1 ? ` x${q}` : ''}</span>`).join('')}<span class="p-sku">Continuam valendo até a troca de plano</span></dd>` : ''}
            <dt>Usuários</dt><dd><span class="p-name">${num(e.totalUsuarios)} de ${max}</span><button class="link-btn" data-action="limite" data-id="${e.id}">Mudar limite</button></dd>
            <dt>Produtos</dt><dd>${num(e.maxProdutos) ? `Até ${num(e.maxProdutos)}` : '<span class="muted">Sem limite</span>'}</dd>
            <dt>Recursos</dt><dd class="recursos">${RECURSOS.map((r) => `<span class="chip ${recursos[r.k] ? 'st-novo' : 'st-ignorar'}">${recursos[r.k] ? '' : 'Sem '}${esc(r.nome)}</span>`).join('')}</dd>
            ${conv ? `<dt>Código pendente</dt><dd><span class="code-chip">${esc(conv.id)}</span><button class="link-btn" data-action="ver-codigo" data-codigo="${esc(conv.id)}">Ver mensagem</button></dd>` : ''}
          </dl>
        </section>

        <section class="panel">
          <header class="panel-head"><h2>Uso</h2></header>
          <dl class="kv">
            <dt>Último acesso</dt><dd class="${semUso(e) ? 'venc-alerta' : ''}">${quandoFoi(toMs(e.ultimoAcesso))}${toMs(e.ultimoAcesso) ? ` <span class="p-sku">${df.format(toMs(e.ultimoAcesso))}</span>` : ''}</dd>
            <dt>Produtos cadastrados</dt><dd>${uso ? uso.produtos : '<span class="muted">Carregando…</span>'}</dd>
            <dt>Movimentações em 30 dias</dt><dd>${uso ? uso.movs30 : '<span class="muted">Carregando…</span>'}</dd>
            <dt>Última movimentação</dt><dd>${uso ? (uso.ultimaMov ? df.format(uso.ultimaMov) : 'Nenhuma') : '<span class="muted">Carregando…</span>'}</dd>
            <dt>Origem</dt><dd>${e.origem === 'teste' ? `Teste grátis${emTeste(e) ? '' : ', já é pagante'}` : 'Cadastrada pelo admin'}</dd>
            <dt>Ativada em</dt><dd>${toMs(e.ativadoEm) ? dfd.format(toMs(e.ativadoEm)) : '<span class="muted">Ainda não</span>'}</dd>
            <dt>Cadastrada em</dt><dd>${toMs(e.criadoEm) ? dfd.format(toMs(e.criadoEm)) : ''}</dd>
          </dl>
        </section>

        <section class="panel">
          <header class="panel-head"><h2>Contato</h2><button class="btn btn-sm" data-action="contato" data-id="${e.id}">Editar</button></header>
          <dl class="kv">
            <dt>Contato</dt><dd>${esc(e.contatoNome) || '<span class="muted">Não informado</span>'}</dd>
            <dt>WhatsApp</dt><dd>${telefoneDe(e) ? `<a class="link-btn" href="https://wa.me/${waNumero(telefoneDe(e))}" target="_blank" rel="noopener">${esc(fmtFone(telefoneDe(e)))}</a>` : '<span class="muted">Não informado</span>'}</dd>
            <dt>E-mail</dt><dd>${esc(e.contatoEmail || e.donoEmail) || '<span class="muted">Não informado</span>'}</dd>
            <dt>CNPJ</dt><dd>${esc(fmtCnpj(e.cnpj)) || '<span class="muted">Não informado</span>'}</dd>
            <dt>Cidade</dt><dd>${esc(e.cidade) || '<span class="muted">Não informada</span>'}</dd>
          </dl>
        </section>
      </div>

      <section class="panel det-bloco">
        <header class="panel-head"><h2>Usuários</h2>${sit !== 'aguardando' ? `<button class="btn btn-sm" data-action="convite-equipe" data-id="${e.id}">Gerar convite de equipe</button>` : ''}</header>
        ${D.carregando ? '<p class="panel-empty">Carregando…</p>' : D.erro ? `<p class="panel-empty">${esc(D.erro)}</p>` : !D.membros.length ? '<p class="panel-empty">Ninguém ativou esta empresa ainda.</p>' : `
        <ul class="people">${D.membros.sort((a, b) => (a.papel === 'dono' ? -1 : b.papel === 'dono' ? 1 : 0)).map((m) => `
          <li>
            <span class="avatar" aria-hidden="true">${esc((m.nome || m.email || '?').slice(0, 2).toUpperCase())}</span>
            <div class="people-info"><span class="p-name">${esc(m.nome || m.email)}</span><span class="p-meta">${esc(m.email)}</span></div>
            <span class="role ${m.papel === 'dono' ? 'role-dono' : ''}">${m.papel === 'dono' ? 'Responsável' : 'Equipe'}</span>
            <span class="p-meta people-date">Último acesso: ${quandoFoi(toMs(m.ultimoAcesso))}</span>
            ${m.papel === 'dono' ? '<span class="acoes-membro"></span>' : `<span class="acoes-membro">
              <button class="btn btn-sm" data-action="transferir" data-id="${e.id}" data-uid="${m.id}">Tornar responsável</button>
              <button class="btn btn-sm" data-action="remover-usuario" data-id="${e.id}" data-uid="${m.id}">Remover</button></span>`}
          </li>`).join('')}
        </ul>`}
        ${conviteEq.length ? `<p class="table-foot pad">Convites de equipe pendentes: ${conviteEq.map((c) => `<span class="code-chip">${esc(c.id)}</span>`).join(', ')}</p>` : ''}
      </section>

      <section class="panel det-bloco">
        <header class="panel-head"><h2>Cobranças</h2></header>
        ${pedidosPendentes().filter((p) => p.empresaId === e.id).length ? `<div class="pend-bloco"><h3>Pix aguardando confirmação</h3>${tabelaPedidos(pedidosPendentes().filter((p) => p.empresaId === e.id), false)}</div>` : ''}
        ${!cobr.length ? '<p class="panel-empty">Nenhuma cobrança registrada. Elas são criadas junto com cada código de ativação ou renovação.</p>' : tabelaCobrancas(cobr, false)}
      </section>

      <section class="panel det-bloco">
        <header class="panel-head"><h2>Histórico de ações nesta empresa</h2></header>
        ${D.carregando ? '<p class="panel-empty">Carregando…</p>' : !(D.hist || []).length ? '<p class="panel-empty">Nenhuma ação registrada.</p>' : tabelaHistorico(D.hist, false)}
      </section>

      <section class="panel det-bloco lgpd">
        <header class="panel-head"><h2>Dados da empresa (LGPD)</h2></header>
        <div class="imp-text stack">
          <p>Exporte todos os dados da empresa num arquivo JSON quando o cliente pedir uma cópia. A exclusão apaga definitivamente estoque, movimentações, fornecedores, notas, usuários e convites. As cobranças ficam guardadas, porque são registros financeiros que a lei obriga a manter.</p>
          <div class="grupo-acoes lgpd-acoes">
            <button class="btn" data-action="exportar" data-id="${e.id}">Exportar dados (JSON)</button>
            <button class="btn btn-danger" data-action="excluir" data-id="${e.id}">Excluir empresa e todos os dados</button>
          </div>
        </div>
      </section>`;
  }

  /* ================= FINANCEIRO ================= */
  function tabelaCobrancas(lista, comEmpresa) {
    const ST = { pago: ['Pago', 'st-novo'], pendente: ['Aguardando pagamento', 'st-erro'], cancelado: ['Cancelada', 'st-ignorar'] };
    return `<div class="table-wrap flat"><table class="table">
      <thead><tr><th>Data</th>${comEmpresa ? '<th>Empresa</th>' : ''}<th>Referente a</th><th class="num">Valor</th><th>Forma</th><th>Situação</th><th><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${lista.map((c) => `<tr>
        <td class="nowrap">${toMs(c.criadoEm) ? dfd.format(toMs(c.criadoEm)) : ''}</td>
        ${comEmpresa ? `<td><a class="p-name emp-link" href="#/empresa/${esc(c.empresaId)}">${esc(c.empresaNome)}</a></td>` : ''}
        <td><span class="p-name">${c.tipo === 'pacote' ? 'Pacotes' : `${c.tipo === 'empresa' ? 'Ativação' : 'Renovação'}, ${plural(num(c.dias), 'dia', 'dias')}`}</span><span class="p-sku">${esc(c.planoNome || '')}${c.planoNome ? ', ' : ''}código ${esc(c.codigo)}</span></td>
        <td class="num">${cf.format(num(c.valor))}</td>
        <td>${esc(c.forma || '')}</td>
        <td><span class="chip ${ST[c.status][1]}">${ST[c.status][0]}</span>${c.status === 'pago' && toMs(c.pagoEm) ? `<span class="p-sku">em ${dfd.format(toMs(c.pagoEm))}</span>` : ''}</td>
        <td><div class="a-actions">${c.status === 'pendente' ? `
          <button class="btn btn-sm btn-primary" data-action="pagar" data-codigo="${esc(c.id)}">Registrar pagamento</button>
          <button class="btn btn-sm" data-action="cancelar-cobranca" data-codigo="${esc(c.id)}">Cancelar</button>` : ''}</div></td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  function viewFinanceiro() {
    const cs = state.cobrancas;
    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).getTime();
    const pagas = cs.filter((c) => c.status === 'pago');
    const recebidoMes = pagas.filter((c) => toMs(c.pagoEm) >= inicioMes).reduce((s, c) => s + num(c.valor), 0);
    const pendentes = cs.filter((c) => c.status === 'pendente').sort((a, b) => toMs(a.criadoEm) - toMs(b.criadoEm));
    const aReceber = pendentes.reduce((s, c) => s + num(c.valor), 0);
    const proximas = state.empresas.filter((e) => e.ativo !== false && e.donoUid && !emTeste(e) && toMs(e.acessoAte) && diasAte(toMs(e.acessoAte)) <= 30)
      .sort((a, b) => toMs(a.acessoAte) - toMs(b.acessoAte));
    const previsao = proximas.reduce((s, e) => s + valorRenovacao(e).valor, 0);

    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const ini = new Date(agora.getFullYear(), agora.getMonth() - i, 1).getTime();
      const fim = new Date(agora.getFullYear(), agora.getMonth() - i + 1, 1).getTime();
      meses.push({ rotulo: rotuloMes(ini), valor: pagas.filter((c) => toMs(c.pagoEm) >= ini && toMs(c.pagoEm) < fim).reduce((s, c) => s + num(c.valor), 0) });
    }
    const maxMes = Math.max(1, ...meses.map((m) => m.valor));
    const recentes = cs.slice().sort((a, b) => toMs(b.criadoEm) - toMs(a.criadoEm)).slice(0, 60);

    return `
      <div class="topbar"><h1>Financeiro</h1><div class="topbar-actions"><button class="btn" data-action="exportar-cobrancas">Exportar CSV</button></div></div>
      ${pedidosPendentes().length ? `<section class="panel det-bloco pedidos-bloco">
        <header class="panel-head"><h2>Pix aguardando sua confirmação</h2><span class="chip st-erro">${pedidosPendentes().length}</span></header>
        <p class="imp-text muted pedidos-dica">Os clientes geraram estes Pix no app. Confira no extrato do banco pelo valor e pelo identificador e clique em "Confirmar pagamento": a empresa é liberada na hora, sem precisar de código.</p>
        ${tabelaPedidos(pedidosPendentes(), true)}
      </section>` : ''}
      <section class="stats">
        <div class="stat"><span class="stat-label">Recebido neste mês</span><strong class="stat-value">${cf.format(recebidoMes)}</strong><span class="stat-sub">${plural(pagas.filter((c) => toMs(c.pagoEm) >= inicioMes).length, 'pagamento', 'pagamentos')}</span></div>
        <div class="stat ${pendentes.length ? 'is-alert' : ''}"><span class="stat-label">A receber</span><strong class="stat-value">${cf.format(aReceber)}</strong><span class="stat-sub">${plural(pendentes.length, 'cobrança pendente', 'cobranças pendentes')}</span></div>
        <div class="stat"><span class="stat-label">Previsão para 30 dias</span><strong class="stat-value">${cf.format(previsao)}</strong><span class="stat-sub">${plural(proximas.length, 'renovação prevista', 'renovações previstas')}</span></div>
        <div class="stat"><span class="stat-label">Recebido em 6 meses</span><strong class="stat-value">${cf.format(meses.reduce((s, m) => s + m.valor, 0))}</strong><span class="stat-sub">Média de ${cf.format(meses.reduce((s, m) => s + m.valor, 0) / 6)} por mês</span></div>
      </section>

      <section class="panel det-bloco">
        <header class="panel-head"><h2>Recebimentos por mês</h2></header>
        <div class="barras" role="img" aria-label="Valores recebidos nos últimos 6 meses">
          ${meses.map((m) => `<div class="barra"><span class="barra-valor">${m.valor ? cf.format(m.valor) : ''}</span><span class="barra-col" style="height:${Math.max(2, (m.valor / maxMes) * 100)}%"></span><span class="barra-rot">${esc(m.rotulo)}</span></div>`).join('')}
        </div>
      </section>

      <section class="panel det-bloco">
        <header class="panel-head"><h2>Aguardando pagamento</h2></header>
        ${pendentes.length ? tabelaCobrancas(pendentes, true) : '<p class="panel-empty">Nenhuma cobrança pendente.</p>'}
      </section>

      <section class="panel det-bloco">
        <header class="panel-head"><h2>Vencimentos nos próximos 30 dias</h2></header>
        ${!proximas.length ? '<p class="panel-empty">Nenhuma empresa vence nos próximos 30 dias.</p>' : `
        <div class="table-wrap flat"><table class="table">
          <thead><tr><th>Empresa</th><th>Acesso até</th><th>Plano</th><th class="num">Valor previsto</th><th><span class="sr-only">Ações</span></th></tr></thead>
          <tbody>${proximas.map((e) => { const v = valorRenovacao(e); const pend = conviteDe(e.id, 'renovacao'); return `<tr>
            <td><a class="p-name emp-link" href="#/empresa/${e.id}">${esc(e.nome)}</a></td>
            <td class="nowrap">${txtAcesso(e)}</td>
            <td>${esc(v.plano) || '<span class="muted">Sem plano</span>'}</td>
            <td class="num">${cf.format(v.valor)}</td>
            <td><div class="a-actions">${pend ? `<span class="p-sku">Código ${esc(pend.id)} enviado</span>` : `
              <button class="btn btn-sm" data-action="cobrar" data-id="${e.id}">Cobrar</button>
              <button class="btn btn-sm btn-primary" data-action="codigo" data-tipo="renovacao" data-id="${e.id}">Renovar</button>`}</div></td>
          </tr>`; }).join('')}</tbody></table></div>`}
      </section>

      <section class="panel det-bloco">
        <header class="panel-head"><h2>Últimas cobranças</h2></header>
        ${recentes.length ? tabelaCobrancas(recentes, true) : '<p class="panel-empty">Nenhuma cobrança ainda. Cada código gerado com valor cria uma cobrança aqui.</p>'}
      </section>`;
  }

  /* ================= PLANOS ================= */
  function viewPlanos() {
    const cat = catalogo();
    const niveis = cat.filter(Ass.ehNivel).sort((a, b) => num(a.ordem) - num(b.ordem));
    const salvos = state.planos.some(Ass.ehNivel);
    const legados = state.planos.filter(Ass.ehLegado);
    const teste = state.planos.find((p) => p.id === 'teste');
    const testeDefasado = !teste || ['kits', 'integracao'].some((k) => !(teste.recursos || {})[k]);
    const faltam = ['basico', 'pro', 'premium'].filter((id) => !state.planos.find((p) => p.id === id && Ass.ehNivel(p)));
    const faltaPadrao = faltam.length > 0 || testeDefasado;
    const usuariosDe = (id) => state.empresas.filter((e) => e.planoId === id).length;
    const cardNivel = (p) => {
      const rec = { ...TODOS_RECURSOS, ...(p.recursos || {}) };
      const n = salvos ? usuariosDe(p.id) : 0;
      return `<article class="plano-card ${p.ativo === false ? 'is-off' : ''} ${p.destaque ? 'is-destaque' : ''}">
        <header><h2>${esc(p.nome)}</h2>${p.ativo === false ? '<span class="chip st-ignorar">Desativado</span>' : p.destaque ? '<span class="chip st-atualizar">Mais escolhido</span>' : p.publico === false ? '<span class="chip st-ignorar">Só pelo admin</span>' : ''}</header>
        ${p.descricao ? `<p class="plano-desc">${esc(p.descricao)}</p>` : ''}
        <table class="precos-tab"><tbody>${Ass.PERIODOS.map((per) => `<tr><th>${per.nome}</th><td>${cf.format(Ass.preco(p, per.id))}</td><td class="eq">${per.meses > 1 ? `${cf.format(Ass.equivalenteMes(p, per.id))}/mês${Ass.rotuloDesconto(p, per.id) ? `, ${esc(Ass.rotuloDesconto(p, per.id))}` : ''}` : ''}</td></tr>`).join('')}</tbody></table>
        <ul class="plano-lista">
          <li>Até ${plural(num(p.maxUsuarios) || MAX_USUARIOS_PADRAO, 'usuário', 'usuários')}</li>
          <li>${num(p.maxProdutos) ? `Até ${num(p.maxProdutos)} produtos` : 'Produtos ilimitados'}</li>
          ${RECURSOS.map((r) => `<li class="${rec[r.k] ? '' : 'nao'}">${rec[r.k] ? '' : 'Sem '}${esc(r.nome)}</li>`).join('')}
          <li class="${p.suportePrioritario ? '' : 'nao'}">${p.suportePrioritario ? '' : 'Sem '}Suporte prioritário</li>
        </ul>
        <footer><span class="p-sku">${plural(n, 'empresa', 'empresas')} neste plano</span><button class="btn btn-sm" data-action="plano-editar" data-plano="${p.id}">Editar</button></footer>
      </article>`;
    };
    return `
      <div class="topbar"><h1>Planos</h1><div class="topbar-actions">
        ${faltaPadrao ? '<button class="btn btn-primary" data-action="criar-padroes">Criar planos padrão</button>' : '<button class="btn" data-action="plano-novo">Novo plano</button>'}</div></div>
      ${!salvos ? `<p class="alerta-pedidos alerta-info"><strong>Estes são os planos padrão, ainda não salvos.</strong><span>O app e a página inicial já usam estes valores. Clique em "Criar planos padrão" para gravá-los no Firestore e poder editar preços e recursos.</span></p>`
        : testeDefasado ? '<p class="alerta-pedidos alerta-info"><strong>O teste grátis precisa ser atualizado.</strong><span>Clique em "Criar planos padrão" para ele liberar tudo do Premium, inclusive kits.</span></p>' : ''}
      <div class="planos-grid planos-tres">${niveis.map(cardNivel).join('')}</div>
      <p class="imp-text muted planos-nota">O teste grátis (7 dias, até 5 usuários) libera todos os recursos do Premium e é criado pelo próprio cliente. Trimestral com 10% de desconto e anual com 2 meses grátis são só uma regra de preços: o que vale é o valor que você salvar em cada plano.</p>
      ${legados.length ? `
      <div class="topbar sub-topbar"><h2>Planos antigos</h2></div>
      <p class="imp-text muted planos-nota">Não são mais vendidos, mas continuam valendo para quem já os tem até a próxima renovação. Quando ninguém mais estiver neles, pode desativá-los.</p>
      <div class="planos-grid">${legados.map((p) => `<article class="plano-card ${p.ativo === false ? 'is-off' : ''}">
        <header><h2>${esc(p.nome)}</h2><span class="chip st-ignorar">Antigo</span></header>
        <p class="plano-preco">${cf.format(num(p.preco))}<span> a cada ${plural(num(p.dias) || 30, 'dia', 'dias')}</span></p>
        <footer><span class="p-sku">${plural(usuariosDe(p.id), 'empresa', 'empresas')} neste plano</span><button class="btn btn-sm" data-action="plano-ativo" data-plano="${p.id}" data-valor="${p.ativo === false ? '1' : '0'}">${p.ativo === false ? 'Reativar' : 'Desativar'}</button></footer>
      </article>`).join('')}</div>` : ''}`;
  }

  function modalPlano(p) {
    const ed = Boolean(p);
    p = p || { ordem: (state.planos.filter(Ass.ehNivel).length || 0) + 1, precos: { mensal: '', trimestral: '', anual: '' }, maxUsuarios: MAX_USUARIOS_PADRAO, maxProdutos: 0, recursos: { ...TODOS_RECURSOS }, ativo: true, publico: true };
    const rec = { ...TODOS_RECURSOS, ...(p.recursos || {}) };
    const n = ed ? state.empresas.filter((e) => e.planoId === p.id).length : 0;
    const m = openModal(`
      <form id="f-plano" novalidate>
        ${head(ed ? `Editar plano ${esc(p.nome)}` : 'Novo plano')}
        <div class="modal-body grid-2">
          <label class="field"><span>Nome do plano</span><input name="nome" maxlength="40" value="${esc(p.nome)}" placeholder="Ex.: Pro" autofocus></label>
          <label class="field"><span>Posição na lista (1 = primeiro)</span><input name="ordem" type="number" min="1" max="20" step="1" value="${esc(p.ordem ?? 1)}"></label>
          <label class="field span-2"><span>Descrição (aparece para o cliente)</span><input name="descricao" maxlength="120" value="${esc(p.descricao)}" placeholder="Ex.: Para quem está saindo do caderno ou da planilha."></label>
          ${Ass.PERIODOS.map((per) => `<label class="field"><span>Preço ${per.nome.toLowerCase()} (R$)</span><input name="preco-${per.id}" type="number" min="0.01" step="0.01" value="${esc(p.precos && p.precos[per.id] !== undefined ? p.precos[per.id] : '')}"></label>`).join('')}
          <p class="confirm-text muted" id="plano-prev"></p>
          <label class="field"><span>Usuários por empresa</span><input name="maxUsuarios" type="number" min="1" max="100" step="1" value="${esc(p.maxUsuarios)}"></label>
          <label class="field"><span>Limite de produtos (0 = sem limite)</span><input name="maxProdutos" type="number" min="0" step="1" value="${esc(p.maxProdutos || 0)}"></label>
          <fieldset class="field span-2 recursos-set"><legend>Recursos incluídos</legend>
            ${RECURSOS.map((r) => `<label class="check"><input type="checkbox" name="rec-${r.k}" ${rec[r.k] ? 'checked' : ''}> ${esc(r.nome)}</label>`).join('')}
            <label class="check"><input type="checkbox" name="suporte" ${p.suportePrioritario ? 'checked' : ''}> Suporte prioritário pelo WhatsApp</label>
          </fieldset>
          <label class="check span-2"><input type="checkbox" name="destaque" ${p.destaque ? 'checked' : ''}> Marcar como "Mais escolhido" (só um plano deve ter essa marca)</label>
          <label class="check span-2"><input type="checkbox" name="ativo" ${p.ativo !== false ? 'checked' : ''}> Plano disponível para novas empresas e renovações</label>
          <label class="check span-2"><input type="checkbox" name="publico" ${p.publico !== false ? 'checked' : ''}> Vendido no app e na página inicial: o cliente escolhe este plano e paga por Pix sozinho</label>
          ${n ? `<label class="check span-2"><input type="checkbox" name="propagar" checked> Aplicar limites e recursos às ${plural(n, 'empresa', 'empresas')} que já estão neste plano</label>` : ''}
          <p class="form-error span-2" role="alert" hidden></p>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="fechar">Cancelar</button><button class="btn btn-primary" type="submit">${ed ? 'Salvar plano' : 'Criar plano'}</button></footer>
      </form>`, true);
    const f = $('#f-plano', m);
    const precos = () => ({ mensal: num(f['preco-mensal'].value), trimestral: num(f['preco-trimestral'].value), anual: num(f['preco-anual'].value) });
    const previa = () => {
      const pr = precos(); const tmp = { precos: pr };
      $('#plano-prev', m).textContent = pr.mensal > 0
        ? `Trimestral: ${Ass.rotuloDesconto(tmp, 'trimestral') || 'sem desconto'}. Anual: ${Ass.rotuloDesconto(tmp, 'anual') || 'sem desconto'}.` : '';
    };
    f.addEventListener('input', previa); previa();
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const dados = {
        nome: f.nome.value.trim(), ordem: Math.round(num(f.ordem.value)) || 1, descricao: f.descricao.value.trim(), precos: precos(),
        maxUsuarios: Math.round(num(f.maxUsuarios.value)), maxProdutos: Math.round(num(f.maxProdutos.value)),
        recursos: Object.fromEntries(RECURSOS.map((r) => [r.k, f[`rec-${r.k}`].checked])), suportePrioritario: f.suporte.checked,
        destaque: f.destaque.checked, ativo: f.ativo.checked, publico: f.publico.checked
      };
      if (!dados.nome) return erroForm(f, 'Dê um nome ao plano.');
      if (Object.values(dados.precos).some((v) => !(v > 0))) return erroForm(f, 'Informe os três preços (mensal, trimestral e anual), todos maiores que zero.');
      if (dados.maxUsuarios < 1) return erroForm(f, 'O plano precisa permitir pelo menos 1 usuário.');
      if (state.planos.some((x) => x.id !== (p.id || '') && norm(x.nome) === norm(dados.nome))) return erroForm(f, 'Já existe um plano com esse nome.');
      const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      try {
        const ref = ed ? db.collection('planos').doc(p.id) : db.collection('planos').doc();
        const propagar = ed && f.propagar && f.propagar.checked;
        const afetadas = propagar ? state.empresas.filter((e) => e.planoId === p.id) : [];
        await comLog(ed ? 'plano_editar' : 'plano_criar', null,
          `${dados.nome}: ${cf.format(dados.precos.mensal)} / ${cf.format(dados.precos.trimestral)} / ${cf.format(dados.precos.anual)}, ${dados.maxUsuarios} usuários${afetadas.length ? `. Aplicado a ${afetadas.length} empresas` : ''}`, (b) => {
            b.set(ref, { ...dados, ...(ed ? { atualizadoEm: FV.serverTimestamp() } : { criadoEm: FV.serverTimestamp() }) }, { merge: true });
            // só um plano com a marca "Mais escolhido"
            if (dados.destaque) state.planos.filter((x) => x.id !== ref.id && x.destaque && Ass.ehNivel(x)).forEach((x) => b.update(db.collection('planos').doc(x.id), { destaque: false }));
            afetadas.forEach((e) => b.update(db.collection('empresas').doc(e.id), camposPlano({ id: ref.id, ...dados }, (periodoDe(e) || Ass.PERIODOS[0]).id)));
          });
        closeModal(); toast(ed ? 'Plano salvo.' : 'Plano criado.');
      } catch (x) { erroForm(f, msgErro(x)); btn.disabled = false; }
    });
  }

  /* ================= HISTÓRICO ================= */
  async function carregarHistorico() {
    state.historico = { carregando: true, itens: [] };
    try {
      const s = await db.collection('auditoria').orderBy('criadoEm', 'desc').limit(300).get();
      state.historico = { carregando: false, itens: s.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })) };
    } catch (e) { state.historico = { carregando: false, itens: [], erro: msgErro(e) }; }
    render();
  }

  function tabelaHistorico(itens, comEmpresa) {
    return `<div class="table-wrap flat"><table class="table">
      <thead><tr><th>Quando</th><th>Ação</th>${comEmpresa ? '<th>Empresa</th>' : ''}<th>Detalhes</th><th>Admin</th></tr></thead>
      <tbody>${itens.map((h) => `<tr>
        <td class="nowrap">${toMs(h.criadoEm) ? df.format(toMs(h.criadoEm)) : ''}</td>
        <td><span class="p-name">${esc(ACOES[h.acao] || h.acao)}</span></td>
        ${comEmpresa ? `<td>${h.empresaId && empById(h.empresaId) ? `<a class="emp-link" href="#/empresa/${esc(h.empresaId)}">${esc(h.empresaNome)}</a>` : esc(h.empresaNome || '')}</td>` : ''}
        <td class="obs">${esc(h.detalhes)}</td>
        <td class="p-sku">${esc(h.adminEmail)}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  function viewHistorico() {
    const H = state.historico;
    const qq = norm(state.hq);
    const itens = H ? H.itens.filter((h) => !qq || norm(`${ACOES[h.acao] || h.acao} ${h.empresaNome} ${h.detalhes} ${h.adminEmail}`).includes(qq)) : [];
    return `
      <div class="topbar"><h1>Histórico de ações</h1><div class="topbar-actions">
        <button class="btn" data-action="historico-atualizar">Atualizar</button>
        <button class="btn" data-action="exportar-historico">Exportar CSV</button></div></div>
      <p class="intro">Tudo o que é feito neste painel fica registrado aqui e não pode ser alterado nem apagado. Mostra as últimas 300 ações.</p>
      <div class="toolbar"><label class="search"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/></svg>
        <input type="search" id="h-busca" value="${esc(state.hq)}" placeholder="Buscar por ação, empresa, detalhe ou admin" aria-label="Buscar no histórico"></label></div>
      ${!H || H.carregando ? '<div class="loading">Carregando…</div>' : H.erro ? `<p class="no-results">${esc(H.erro)}</p>`
        : !itens.length ? '<p class="no-results">Nenhuma ação encontrada.</p>' : `<section class="panel">${tabelaHistorico(itens, true)}</section>`}`;
  }

  /* ================= CONFIGURAÇÕES ================= */
  function viewConfig() {
    const c = state.config;
    const tipos = [['cpfcnpj', 'CPF ou CNPJ'], ['email', 'E-mail'], ['celular', 'Celular'], ['aleatoria', 'Chave aleatória']];
    return `
      <div class="topbar"><h1>Configurações</h1></div>
      <form id="f-config" class="panel config-form" novalidate>
        <header class="panel-head"><h2>Recebimento por Pix</h2></header>
        <div class="modal-body grid-2">
          <p class="confirm-text muted span-2">Estes dados montam o QR Code e o Pix copia e cola que os clientes veem ao escolher um plano. O nome e a cidade precisam ser os mesmos cadastrados no seu banco para a chave.</p>
          <label class="field"><span>Tipo de chave</span><select name="tipoChave">${tipos.map(([v, t]) => `<option value="${v}" ${(c.tipoChave || 'cpfcnpj') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="field"><span>Chave Pix</span><input name="chavePix" maxlength="120" value="${esc(c.chavePix)}"></label>
          <label class="field"><span>Nome de quem recebe</span><input name="nomeRecebedor" maxlength="60" value="${esc(c.nomeRecebedor)}" placeholder="Como está no banco"></label>
          <label class="field"><span>Cidade de quem recebe</span><input name="cidadeRecebedor" maxlength="40" value="${esc(c.cidadeRecebedor)}" placeholder="Ex.: Recife"></label>
          <div class="span-2 pix-teste-area" id="pix-teste"></div>
        </div>
        <header class="panel-head"><h2>Contato e mensagens</h2></header>
        <div class="modal-body grid-2">
          <label class="field"><span>WhatsApp do suporte</span><input name="whatsappSuporte" inputmode="tel" maxlength="20" value="${esc(fmtFone(c.whatsappSuporte))}" placeholder="Recebe os comprovantes de Pix"></label>
          <label class="field"><span>Endereço do Estokio para os clientes</span><input name="urlApp" maxlength="200" value="${esc(c.urlApp)}" placeholder="${esc(cfg.projectId ? `https://${cfg.projectId}.web.app` : 'https://…')}"></label>
          <label class="field span-2"><span>Texto extra no fim das mensagens de cobrança</span><textarea name="mensagemExtra" rows="3" maxlength="400" placeholder="Ex.: Qualquer dúvida, é só responder esta mensagem.">${esc(c.mensagemExtra)}</textarea></label>
          <p class="form-error span-2" role="alert" hidden></p>
        </div>
        <footer class="modal-foot">
          <button class="btn" type="button" data-action="pix-teste">Gerar Pix de teste de R$ 1,00</button>
          <button class="btn btn-primary" type="submit">Salvar configurações</button>
        </footer>
      </form>`;
  }

  /** Gera um Pix de R$ 1,00 com os dados do formulário para você testar no app do banco. */
  function pixTeste() {
    const f = $('#f-config');
    const area = $('#pix-teste');
    if (!f || !area) return;
    if (!f.chavePix.value.trim() || !f.nomeRecebedor.value.trim() || !f.cidadeRecebedor.value.trim()) return erroForm(f, 'Preencha chave, nome e cidade para gerar o Pix de teste.');
    erroForm(f, '');
    const codigo = Pix.payload({ chave: f.chavePix.value, tipoChave: f.tipoChave.value, nome: f.nomeRecebedor.value, cidade: f.cidadeRecebedor.value, valor: 1, txid: 'TESTEESTOKIO' });
    area.innerHTML = `<div class="pix-teste"><div class="pix-qr"></div><div class="stack"><strong>Pix de teste: R$ 1,00</strong>
      <p class="muted">Abra o app do seu banco e leia o QR Code (ou cole o código). Se aparecer o seu nome e a sua chave, está tudo certo. Não precisa concluir o pagamento.</p>
      <textarea readonly rows="3" class="msg-box pix-cc">${esc(codigo)}</textarea></div></div>`;
    Pix.desenharQR(area.querySelector('.pix-qr'), codigo, 180).catch((e) => { area.querySelector('.pix-qr').textContent = e.message; });
  }

  /* ================= mensagens para o cliente ================= */
  function textoCodigo(emp, c) {
    const oi = emp.contatoNome ? `Olá, ${emp.contatoNome}!` : 'Olá!';
    if (c.tipo === 'renovacao') {
      return `${oi} Segue o código de renovação do Estokio para ${emp.nome}: ${c.id}\n\n` +
        `Ele adiciona ${c.dias} dias ao acesso. Para usar: entre no Estokio, abra o menu Empresa e digite o código em "Validade do acesso".\n\n` +
        'Pode aplicar antes do vencimento: os dias são somados ao prazo atual, sem perder nenhum.';
    }
    return `${oi} O acesso de ${emp.nome} ao Estokio está pronto.\n\n` +
      `1. Acesse ${linkCodigo(c.id) || urlApp()}\n2. Crie sua conta (o código já vem preenchido pelo link)\n3. Se pedir, use o código ${c.id}\n\n` +
      `O código inclui ${c.dias || 30} dias de acesso. Depois você personaliza o sistema com o logo e as cores da empresa e convida até ${(num(emp.maxUsuarios) || MAX_USUARIOS_PADRAO) - 1} pessoas da sua equipe. ` +
      `O código precisa ser usado até ${dfd.format(toMs(c.validoAte))} e só vale uma vez.`;
  }

  function textoCobranca(e) {
    const v = valorRenovacao(e);
    if (emTeste(e)) {
      const oiT = e.contatoNome ? `Olá, ${e.contatoNome}!` : 'Olá!';
      const ateT = toMs(e.acessoAte);
      const vend = planosVenda();
      const menor = vend.length ? Math.min(...vend.map((p) => Ass.equivalenteMes(p, 'anual'))) : 0;
      return `${oiT} O teste grátis de ${e.nome} no Estokio ${ateT > Date.now() ? `termina em ${dfd.format(ateT)}` : `terminou em ${dfd.format(ateT)}`}.\n\n` +
        `Para continuar, é só entrar no sistema, escolher um plano${menor ? ` (a partir de ${cf.format(menor)} por mês no anual)` : ''} e pagar por Pix na própria tela. ` +
        `Tudo o que você cadastrou continua lá.${state.config.mensagemExtra ? `\n\n${state.config.mensagemExtra}` : ''}`;
    }
    const ate = toMs(e.acessoAte);
    const oi = e.contatoNome ? `Olá, ${e.contatoNome}!` : 'Olá!';
    const prazo = !ate ? 'está próximo de renovar' : ate > Date.now() ? `vence em ${dfd.format(ate)}` : `venceu em ${dfd.format(ate)}`;
    const pix = state.config.chavePix ? `\n\nPix: ${state.config.chavePix}${state.config.nomeRecebedor ? ` (${state.config.nomeRecebedor})` : ''}` : '';
    const extra = state.config.mensagemExtra ? `\n\n${state.config.mensagemExtra}` : '';
    const pl = planoById(e.planoId);
    const novidade = pl && Ass.ehLegado(pl) ? `\n\nNovidade: agora temos os planos Básico, Pro e Premium. Na renovação, você pode escolher o que combina com o seu negócio.` : '';
    return `${oi} O acesso de ${e.nome} ao Estokio ${prazo}.\n\n` +
      `Renovação${v.plano ? ` do plano ${v.plano}` : ''} por ${v.dias} dias: ${cf.format(v.valor)}.${novidade}${pix}\n\n` +
      `Pelo sistema, em Empresa > Renovar ou mudar de plano, você paga por Pix e é liberado na hora. Se preferir, é só me responder.${extra}`;
  }

  function modalMensagem(titulo, intro, codigo, msg, fone, emp, acaoLog) {
    const wa = `https://wa.me/${fone ? waNumero(fone) : ''}?text=${encodeURIComponent(msg)}`;
    const m = openModal(`${head(titulo)}
      <div class="modal-body">
        <p class="confirm-text">${intro}</p>
        ${codigo ? `<div class="code-big">${esc(codigo)}</div>` : ''}
        <label class="field"><span>Mensagem${fone ? ` para ${esc(fmtFone(fone))}` : ''}</span><textarea rows="9" class="msg-box" id="msg-texto">${esc(msg)}</textarea></label>
      </div>
      <footer class="modal-foot">
        ${codigo ? `<button class="btn" data-action="copiar" data-texto="${esc(codigo)}">Copiar só o código</button>` : ''}
        <button class="btn" data-msg="copiar">Copiar mensagem</button>
        <a class="btn btn-primary" href="${esc(wa)}" target="_blank" rel="noopener" data-msg="whatsapp">Enviar pelo WhatsApp</a>
      </footer>`, true);
    const texto = () => $('#msg-texto', m).value;
    const logar = () => { if (acaoLog) comLog(acaoLog, emp, `Mensagem ${fone ? `para ${fmtFone(fone)}` : 'copiada'}`).catch(() => {}); };
    $('[data-msg="copiar"]', m).addEventListener('click', () => { copiar(texto()); logar(); });
    $('[data-msg="whatsapp"]', m).addEventListener('click', (ev) => {
      ev.currentTarget.href = `https://wa.me/${fone ? waNumero(fone) : ''}?text=${encodeURIComponent(texto())}`;
      logar();
    });
  }

  const mostrarCodigo = (emp, c) => modalMensagem(
    `${c.tipo === 'renovacao' ? 'Renovação' : c.tipo === 'membro' ? 'Convite de equipe' : 'Código de ativação'}: ${esc(emp.nome)}`,
    c.tipo === 'renovacao' ? `Envie este código ao responsável. Ele soma ${c.dias} dias ao acesso quando aplicado no menu Empresa.`
      : c.tipo === 'membro' ? 'Envie este código para a pessoa que vai entrar na equipe. Vale por 7 dias e ocupa uma vaga.'
      : 'Envie este código ao responsável pela empresa. Quem usar primeiro vira o responsável pela conta.',
    c.id, c.tipo === 'membro' ? textoConviteEquipe(emp, c) : textoCodigo(emp, c), telefoneDe(emp), emp, null);

  function textoConviteEquipe(emp, c) {
    return `Você foi convidado para a equipe de ${emp.nome} no Estokio.\n\n1. Acesse ${linkCodigo(c.id) || urlApp()}\n2. Crie sua conta (o código já vem preenchido pelo link)\n3. Se pedir, use o código ${c.id}\n\nO código vale por 7 dias e só pode ser usado uma vez.`;
  }

  /* ================= PEDIDOS PIX (pagamentos a confirmar) ================= */
  /** Valor que o pedido deveria ter pela tabela atual (para conferir se o cliente não alterou nada). */
  function valorEsperado(p) {
    if (p.tipo !== 'plano') return null;
    const pl = planoById(p.planoId);
    if (!pl) return null;
    if (Ass.ehNivel(pl)) return Ass.periodoDe(p.periodo) ? Ass.orcamento(pl, p.periodo).total : null;
    return num(pl.preco);
  }
  const pedidosPendentes = () => state.pedidos.filter((p) => p.status === 'aguardando').sort((a, b) => toMs(a.criadoEm) - toMs(b.criadoEm));

  function tabelaPedidos(lista, comEmpresa) {
    return `<div class="table-wrap flat"><table class="table">
      <thead><tr><th>Pedido em</th>${comEmpresa ? '<th>Empresa</th>' : ''}<th>O que foi pedido</th><th class="num">Valor</th><th>Identificador do Pix</th><th>Conferência</th><th><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${lista.map((p) => {
        const esp = valorEsperado(p);
        const ok = esp !== null && Math.abs(esp - num(p.valor)) < 0.02;
        return `<tr>
          <td class="nowrap">${toMs(p.criadoEm) ? df.format(toMs(p.criadoEm)) : ''}<span class="p-sku">${esc(p.criadoPor || '')}</span></td>
          ${comEmpresa ? `<td><a class="p-name emp-link" href="#/empresa/${esc(p.empresaId)}">${esc(p.empresaNome)}</a></td>` : ''}
          <td><span class="p-name">${esc(Ass.descreverItens(p.itens || []))}</span><span class="p-sku">${p.tipo === 'plano' ? `Adiciona ${plural(num(p.dias), 'dia', 'dias')}` : 'Pedido de pacote antigo: recuse e peça ao cliente para escolher um plano'}</span></td>
          <td class="num"><strong>${cf.format(num(p.valor))}</strong></td>
          <td><span class="code-chip">${esc(p.txid)}</span></td>
          <td>${ok ? '<span class="chip st-novo">Confere com a tabela</span>' : `<span class="chip st-erro">Diferente da tabela</span><span class="p-sku">Tabela atual: ${esp === null ? 'sem referência' : cf.format(esp)}</span>`}</td>
          <td><div class="a-actions">
            ${p.tipo === 'plano' ? `<button class="btn btn-sm btn-primary" data-action="confirmar-pedido" data-pedido="${esc(p.id)}">Confirmar pagamento</button>` : ''}
            <button class="btn btn-sm" data-action="recusar-pedido" data-pedido="${esc(p.id)}">Recusar</button>
          </div></td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function modalConfirmarPedido(p) {
    if (!p) return;
    const e = empById(p.empresaId);
    if (!e) return toast('A empresa deste pedido não existe mais.', 'erro');
    const plano = planoById(p.planoId);
    const per = Ass.periodoDe(p.periodo) || Ass.periodoPorDias(p.dias);
    const esp = valorEsperado(p);
    const difere = esp === null || Math.abs(esp - num(p.valor)) >= 0.02;
    const dias = per ? per.dias : num(p.dias);
    const novoAte = Math.max(Date.now(), toMs(e.acessoAte) > Date.now() && !emTeste(e) ? toMs(e.acessoAte) : 0) + dias * DIA;
    const excede = plano ? Ass.limitesExcedidos(plano, { usuarios: num(e.totalUsuarios), produtos: 0 }) : [];
    const perdidos = plano && !emTeste(e) ? Ass.recursosPerdidos(e.recursos, plano) : [];
    const m = openModal(`
      <form id="f-conf" novalidate>
        ${head('Confirmar pagamento')}
        <div class="modal-body">
          <p class="confirm-text">Confira no extrato do banco se entrou um Pix de <strong>${cf.format(num(p.valor))}</strong>${p.txid ? ` com o identificador <strong>${esc(p.txid)}</strong>` : ''} de <strong>${esc(e.nome)}</strong>.</p>
          ${difere ? `<p class="form-error">Atenção: o valor do pedido é diferente da tabela atual (${esp === null ? 'plano sem referência' : cf.format(esp)}). Isso acontece se você mudou preços depois do pedido. Confirme só se o valor que entrou no banco estiver certo.</p>` : ''}
          ${excede.length ? `<p class="form-error">${esc(excede[0])} Se confirmar, ninguém perde o acesso, mas novas pessoas não poderão entrar.</p>` : ''}
          <dl class="kv">
            <dt>Pedido</dt><dd>${esc(Ass.descreverItens(p.itens || []))}</dd>
            <dt>Plano atual</dt><dd>${esc(e.planoNome || 'sem plano')}${periodoDe(e) && !emTeste(e) ? `, ${esc(periodoDe(e).nome.toLowerCase())}` : ''}</dd>
            <dt>Acesso</dt><dd>Passa a valer até <strong>${dfd.format(novoAte)}</strong></dd>
            ${perdidos.length ? `<dt>Deixa de ter</dt><dd>${esc(perdidos.join(', '))}</dd>` : ''}
          </dl>
          <label class="field"><span>Data do pagamento</span><input name="data" type="date" value="${hojeStr()}" max="${hojeStr()}"></label>
          <p class="form-error" role="alert" hidden></p>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="fechar">Cancelar</button><button class="btn btn-primary" type="submit">Confirmar e liberar</button></footer>
      </form>`, true);
    const f = $('#f-conf', m);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      const pagoEm = new Date((f.data.value || hojeStr()) + 'T12:00:00').getTime();
      if (!plano || !per) { erroForm(f, 'O plano ou o período deste pedido não existe mais. Recuse o pedido e use "Renovar" no detalhe da empresa.'); btn.disabled = false; return; }
      const campos = { ...camposPlano(plano, per.id), acessoAte: TS.fromMillis(novoAte) };
      try {
        await comLog('confirmar_pedido', e, `${cf.format(num(p.valor))} por Pix (${p.txid}): ${Ass.descreverItens(p.itens || [])}`, (b) => {
          b.update(db.collection('empresas').doc(e.id), campos);
          b.set(db.collection('cobrancas').doc(p.txid || p.id), {
            codigo: p.txid || p.id, tipo: 'renovacao', empresaId: e.id, empresaNome: e.nome,
            planoId: plano.id, planoNome: `${plano.nome}, ${per.nome.toLowerCase()}`, dias,
            valor: num(p.valor), forma: 'Pix', status: 'pago', pagoEm: TS.fromMillis(pagoEm), criadoEm: FV.serverTimestamp(),
            criadoPor: auth.currentUser.email, pedidoId: p.id, itens: p.itens || [], origem: 'pedido'
          });
          b.update(db.collection('pedidos').doc(p.id), { status: 'confirmado', confirmadoEm: FV.serverTimestamp(), confirmadoPor: auth.currentUser.email });
        });
        closeModal(); toast(`Pagamento confirmado. ${e.nome} foi liberada.`); recarregarDetalhe();
      } catch (x) { erroForm(f, msgErro(x)); btn.disabled = false; }
    });
  }

  function modalRecusarPedido(p) {
    if (!p) return;
    const m = openModal(`
      <form id="f-rec" novalidate>
        ${head('Recusar pedido')}
        <div class="modal-body">
          <p class="confirm-text">O pedido de ${cf.format(num(p.valor))} de <strong>${esc(p.empresaNome)}</strong> sai da lista. Use quando o Pix não entrou ou entrou com valor errado. O cliente pode gerar um novo pedido no app.</p>
          <label class="field"><span>Motivo</span><input name="motivo" maxlength="160" placeholder="Ex.: Pix não identificado no extrato" autofocus></label>
          <p class="form-error" role="alert" hidden></p>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="fechar">Cancelar</button><button class="btn btn-danger" type="submit">Recusar pedido</button></footer>
      </form>`);
    const f = $('#f-rec', m);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!f.motivo.value.trim()) return erroForm(f, 'Informe o motivo. Ele fica no histórico.');
      try {
        await comLog('recusar_pedido', empById(p.empresaId) || { id: p.empresaId, nome: p.empresaNome }, `${cf.format(num(p.valor))} (${p.txid}). Motivo: ${f.motivo.value.trim()}`,
          (b) => b.update(db.collection('pedidos').doc(p.id), { status: 'recusado', motivo: f.motivo.value.trim(), recusadoEm: FV.serverTimestamp() }));
        closeModal(); toast('Pedido recusado.');
      } catch (x) { erroForm(f, msgErro(x)); }
    });
  }

  /* ================= PLANOS PADRÃO ================= */
  /** Cria o Básico, o Pro e o Premium que ainda não existem e atualiza o teste grátis (todos os recursos do Premium). */
  async function criarPadroes() {
    const faltam = ['basico', 'pro', 'premium'].filter((id) => !state.planos.find((p) => p.id === id && Ass.ehNivel(p)));
    const teste = state.planos.find((p) => p.id === 'teste');
    const testeDefasado = !teste || ['kits', 'integracao'].some((k) => !(teste.recursos || {})[k]);
    if (!faltam.length && !testeDefasado) return toast('Os planos padrão já existem.');
    const nomes = faltam.map((id) => Ass.PADRAO_PLANOS[id].nome);
    const ok = await confirmar('Criar planos padrão', `${nomes.length ? `Serão criados: ${nomes.join(', ')}. ` : ''}${testeDefasado ? 'O teste grátis passa a liberar todos os recursos do Premium. ' : ''}Os planos antigos continuam valendo para quem já os tem, mas deixam de ser vendidos.`, 'Criar', false);
    if (!ok) return;
    try {
      await comLog('padroes', null, `${nomes.join(', ')}${testeDefasado ? (nomes.length ? '; ' : '') + 'teste grátis atualizado' : ''}`, (b) => {
        faltam.forEach((id) => b.set(db.collection('planos').doc(id), { ...Ass.PADRAO_PLANOS[id], criadoEm: FV.serverTimestamp() }));
        if (testeDefasado) b.set(db.collection('planos').doc('teste'), { ...Ass.PADRAO_PLANOS.teste, atualizadoEm: FV.serverTimestamp() }, { merge: true });
      });
      toast('Planos criados.');
    } catch (x) { toast(msgErro(x), 'erro'); }
  }

  /** Ativa ou desativa um plano antigo (os que já o têm continuam nele). */
  async function ativarPlanoAntigo(id, ativo) {
    const p = state.planos.find((x) => x.id === id);
    if (!p) return;
    try {
      await comLog('plano_ativo', null, `${p.nome}: ${ativo ? 'reativado' : 'desativado'}`, (b) => b.update(db.collection('planos').doc(id), { ativo, atualizadoEm: FV.serverTimestamp() }));
      toast(ativo ? 'Plano reativado.' : 'Plano desativado.');
    } catch (x) { toast(msgErro(x), 'erro'); }
  }

  /* ================= ações ================= */
  document.addEventListener('input', (e) => {
    if (e.target.id === 'a-busca') { state.q = e.target.value; render(); }
    if (e.target.id === 'h-busca') { state.hq = e.target.value; render(); }
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'a-filtro') { state.filtro = e.target.value; render(); } });
  document.addEventListener('submit', (e) => { if (e.target.id === 'f-config') { e.preventDefault(); salvarConfig(e.target); } });

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) {
      const linha = e.target.closest('[data-abrir]');
      if (linha && !e.target.closest('a,button')) location.hash = `#/empresa/${linha.dataset.abrir}`;
      return;
    }
    const emp = empById(t.dataset.id);
    switch (t.dataset.action) {
      case 'fechar': closeModal(); break;
      case 'sair':
        try { sessionStorage.setItem('estokio:mostrarLogin', '1'); } catch (e) { /* ignora */ }
        auth.signOut(); break;
      case 'copiar': copiar(t.dataset.texto); break;
      case 'nova-empresa': modalNovaEmpresa(); break;
      case 'codigo': modalCodigo(emp, t.dataset.tipo); break;
      case 'ver-codigo': { const c = state.convites.find((x) => x.id === t.dataset.codigo); if (c) mostrarCodigo(empById(c.empresaId), c); break; }
      case 'cobrar': modalMensagem(`Cobrar ${esc(emp.nome)}`, `Lembrete de renovação com o valor${state.config.chavePix ? ' e a chave Pix' : ''}. Revise a mensagem antes de enviar.${state.config.chavePix ? '' : ' Cadastre sua chave Pix em Configurações para ela entrar aqui.'}`, null, textoCobranca(emp), telefoneDe(emp), emp, 'lembrete'); break;
      case 'pagar': modalPagamento(state.cobrancas.find((c) => c.id === t.dataset.codigo)); break;
      case 'cancelar-cobranca': cancelarCobranca(state.cobrancas.find((c) => c.id === t.dataset.codigo)); break;
      case 'ativo': alterarAtivo(emp, t.dataset.valor === '1'); break;
      case 'vencimento': modalVencimento(emp); break;
      case 'limite': modalLimite(emp); break;
      case 'trocar-plano': modalTrocarPlano(emp); break;
      case 'contato': modalContato(emp); break;
      case 'convite-equipe': conviteEquipe(emp); break;
      case 'transferir': transferir(emp, t.dataset.uid); break;
      case 'remover-usuario': removerUsuario(emp, t.dataset.uid); break;
      case 'exportar': exportarEmpresa(emp, t); break;
      case 'excluir': modalExcluir(emp); break;
      case 'plano-novo': modalPlano(null); break;
      case 'criar-padroes': criarPadroes(); break;
      case 'plano-ativo': ativarPlanoAntigo(t.dataset.plano, t.dataset.valor === '1'); break;
      case 'confirmar-pedido': modalConfirmarPedido(state.pedidos.find((x) => x.id === t.dataset.pedido)); break;
      case 'recusar-pedido': modalRecusarPedido(state.pedidos.find((x) => x.id === t.dataset.pedido)); break;
      case 'pix-teste': pixTeste(); break;
      case 'plano-editar': modalPlano(planoById(t.dataset.plano)); break;
      case 'historico-atualizar': state.historico = null; carregarHistorico(); render(); break;
      case 'exportar-historico': exportarHistorico(); break;
      case 'exportar-cobrancas': exportarCobrancas(); break;
    }
  });

  /* ---------- cadastro de empresa ---------- */
  const selectPlano = (atual, comManter) => {
    const ap = planoById(atual);
    const antigoAtual = !comManter && ap && Ass.ehLegado(ap);   // empresa em plano antigo: continua aparecendo na lista
    return `<select name="plano">
    ${comManter ? '<option value="__manter">Manter o plano atual</option>' : ''}
    <option value="" ${!comManter && !atual ? 'selected' : ''}>Sem plano (recursos básicos)</option>
    ${planosVenda().map((p) => `<option value="${p.id}" ${!comManter && atual === p.id ? 'selected' : ''}>${esc(p.nome)}: a partir de ${cf.format(Ass.preco(p, 'mensal'))} por mês</option>`).join('')}
    ${antigoAtual ? `<option value="${ap.id}" selected>${esc(ap.nome)} (plano antigo): ${cf.format(num(ap.preco))} / ${num(ap.dias)} dias</option>` : ''}
  </select>`;
  };
  const selectPeriodo = (atual) => `<select name="periodo">${Ass.PERIODOS.map((per) => `<option value="${per.id}" ${per.id === atual ? 'selected' : ''}>${per.nome}, ${per.dias} dias</option>`).join('')}</select>`;
  const camposPagamento = (valor) => `
    <label class="field"><span>Valor cobrado (R$)</span><input name="valor" type="number" min="0" step="0.01" value="${esc(valor ?? 0)}"></label>
    <label class="field"><span>Forma de pagamento</span><select name="forma">${FORMAS.map((f) => `<option>${f}</option>`).join('')}</select></label>
    <label class="check span-2"><input type="checkbox" name="pago"> Pagamento já recebido</label>`;
  /** Preenche dias e valor pelo plano e pelo período escolhidos. */
  function ligarPlano(f, emp) {
    const aplicar = (origem) => {
      const v = f.plano.value;
      const p = v === '__manter' ? planoById(emp && emp.planoId) : planoById(v);
      if (p && Ass.ehNivel(p)) {
        const atual = emp ? periodoDe(emp) : null;
        if (v === '__manter' && origem !== 'periodo' && atual) f.periodo.value = atual.id;
        const per = Ass.periodoDe(f.periodo.value) || Ass.PERIODOS[0];
        f.periodo.disabled = false;
        f.dias.value = per.dias; f.valor.value = Ass.preco(p, per.id);
      } else if (p) {            // plano antigo: um preço, um período
        f.periodo.disabled = true;
        f.dias.value = num(p.dias) || 30; f.valor.value = num(p.preco);
      } else f.periodo.disabled = false;
      if (f.acessoPrev) f.acessoPrev();
    };
    f.plano.addEventListener('change', () => aplicar('plano'));
    f.periodo.addEventListener('change', () => aplicar('periodo'));
    f.forma.addEventListener('change', () => { if (f.forma.value === 'Cortesia') { f.valor.value = 0; f.pago.checked = true; } });
    aplicar();
  }
  function lerPagamento(f) {
    const forma = f.forma.value;
    const valor = forma === 'Cortesia' ? 0 : num(f.valor.value);
    return { valor, forma, pago: forma === 'Cortesia' || f.pago.checked };
  }
  function novaCobranca(b, codigo, tipo, emp, dias, plano, pag) {
    b.set(db.collection('cobrancas').doc(codigo), {
      codigo, tipo, empresaId: emp.id, empresaNome: emp.nome, planoId: plano ? plano.id : null, planoNome: plano ? plano.nome : (emp.planoNome || ''),
      dias, valor: pag.valor, forma: pag.forma, status: pag.pago ? 'pago' : 'pendente',
      pagoEm: pag.pago ? FV.serverTimestamp() : null, criadoEm: FV.serverTimestamp(), criadoPor: auth.currentUser.email
    });
  }

  function modalNovaEmpresa() {
    const m = openModal(`
      <form id="f-nova" novalidate>
        ${head('Cadastrar empresa')}
        <div class="modal-body grid-2">
          <label class="field span-2"><span>Nome da empresa</span><input name="nome" maxlength="80" autofocus></label>
          <label class="field"><span>CNPJ</span><input name="cnpj" maxlength="18" inputmode="numeric" placeholder="Opcional"></label>
          <label class="field"><span>Nome do contato</span><input name="contatoNome" maxlength="60" placeholder="Quem vai ativar"></label>
          <label class="field"><span>E-mail do contato</span><input name="contatoEmail" type="email" maxlength="120" placeholder="Opcional"></label>
          <label class="field"><span>WhatsApp do contato</span><input name="contatoTelefone" inputmode="tel" maxlength="20" placeholder="(81) 98888-7777"></label>
          <label class="field"><span>Plano</span>${selectPlano((planosVenda().find((p) => p.destaque) || planosVenda()[0] || {}).id, false)}</label>
          <label class="field"><span>Período</span>${selectPeriodo('mensal')}</label>
          <label class="field"><span>Dias de acesso incluídos</span><input name="dias" type="number" min="1" max="3650" step="1" value="30"></label>
          <label class="field"><span>Prazo para ativar o código</span><select name="prazo"><option value="7">7 dias</option><option value="15" selected>15 dias</option><option value="30">30 dias</option></select></label>
          ${camposPagamento(0)}
          <p class="form-error span-2" role="alert" hidden></p>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="fechar">Cancelar</button><button class="btn btn-primary" type="submit">Cadastrar e gerar código</button></footer>
      </form>`, true);
    const f = $('#f-nova', m);
    ligarPlano(f, null);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const nome = f.nome.value.trim();
      if (!nome) return erroForm(f, 'Informe o nome da empresa.');
      const dias = Math.round(num(f.dias.value));
      if (dias < 1) return erroForm(f, 'Informe os dias de acesso.');
      const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      const plano = planoById(f.plano.value);
      const pag = lerPagamento(f);
      const eRef = db.collection('empresas').doc();
      const codigo = gerarCodigo('EST');
      const validoAte = Date.now() + num(f.prazo.value) * DIA;
      const empresa = {
        nome, cnpj: digitos(f.cnpj.value), telefone: '', cidade: '',
        contatoNome: f.contatoNome.value.trim(), contatoEmail: f.contatoEmail.value.trim(), contatoTelefone: digitos(f.contatoTelefone.value),
        logo: null, corPrimaria: '#16233a', corDestaque: '#f2b705',
        ativo: true, configurado: false, donoUid: null, donoEmail: null, origem: 'admin',
        totalUsuarios: 0, maxUsuarios: MAX_USUARIOS_PADRAO, ...camposPlano(plano, f.periodo.value),
        criadoEm: FV.serverTimestamp(), criadoPor: auth.currentUser.email
      };
      const convite = { tipo: 'empresa', empresaId: eRef.id, empresaNome: nome, status: 'pendente', dias, criadoEm: FV.serverTimestamp(), criadoPor: auth.currentUser.uid, validoAte: TS.fromMillis(validoAte) };
      const emp = { id: eRef.id, ...empresa };
      try {
        await comLog('criar_empresa', emp, `Código ${codigo}, ${dias} dias${plano ? `, plano ${plano.nome}` : ''}, ${cf.format(pag.valor)} (${pag.forma}, ${pag.pago ? 'pago' : 'pendente'})`, (b) => {
          b.set(eRef, empresa);
          if (empresa.cnpj) b.set(db.collection('cnpjs').doc(empresa.cnpj), { empresaId: eRef.id, criadoEm: FV.serverTimestamp() });
          b.set(db.collection('convites').doc(codigo), convite);
          novaCobranca(b, codigo, 'empresa', emp, dias, plano, pag);
        });
        toast('Empresa cadastrada.');
        mostrarCodigo(emp, { ...convite, id: codigo, validoAte });
      } catch (x) { erroForm(f, msgErro(x)); btn.disabled = false; }
    });
  }

  /* ---------- código de ativação ou renovação, com cobrança ---------- */
  function modalCodigo(emp, tipo) {
    const antigo = conviteDe(emp.id, tipo);
    const ate = toMs(emp.acessoAte);
    const v = valorRenovacao(emp);
    const m = openModal(`
      <form id="f-codigo" novalidate>
        ${head(tipo === 'empresa' ? 'Novo código de ativação' : `Renovar ${esc(emp.nome)}`)}
        <div class="modal-body grid-2">
          <p class="confirm-text span-2">${tipo === 'empresa'
            ? `Novo código para <strong>${esc(emp.nome)}</strong> ativar a conta. Vale por 15 dias para ser usado.`
            : `Acesso atual até <strong>${ate ? dfd.format(ate) : 'sem data'}</strong>. O responsável aplica o código no menu Empresa e os dias são somados ao prazo atual (ou contados a partir do dia em que aplicar, se já tiver vencido).`}</p>
          <label class="field"><span>Plano</span>${selectPlano(emp.planoId, true)}</label>
          <label class="field"><span>Período</span>${selectPeriodo((periodoDe(emp) || Ass.PERIODOS[0]).id)}</label>
          <label class="field"><span>${tipo === 'empresa' ? 'Dias de acesso incluídos' : 'Dias a adicionar'}</span><input name="dias" type="number" min="1" max="3650" step="1" value="${v.dias || 30}"></label>
          <div class="field"><span>&nbsp;</span><p class="static-val prev-novo muted" id="prev-novo"></p></div>
          ${camposPagamento(v.valor)}
          ${antigo ? `<p class="confirm-text muted span-2">O código pendente ${esc(antigo.id)} deixa de funcionar e a cobrança dele, se ainda não foi paga, é cancelada.</p>` : ''}
          <p class="form-error span-2" role="alert" hidden></p>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="fechar">Cancelar</button><button class="btn btn-primary" type="submit">Gerar código</button></footer>
      </form>`, true);
    const f = $('#f-codigo', m);
    f.acessoPrev = () => {
      if (tipo !== 'renovacao') { $('#prev-novo', m).textContent = ''; return; }
      const novo = Math.max(Date.now(), ate || 0) + num(f.dias.value) * DIA;
      $('#prev-novo', m).textContent = `Se aplicado hoje: acesso até ${dfd.format(novo)}.`;
    };
    f.dias.addEventListener('input', f.acessoPrev);
    ligarPlano(f, emp);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const dias = Math.round(num(f.dias.value));
      if (dias < 1) return erroForm(f, 'Informe os dias.');
      const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      const manter = f.plano.value === '__manter';
      const plano = manter ? planoById(emp.planoId) : planoById(f.plano.value);
      const pag = lerPagamento(f);
      const codigo = gerarCodigo(tipo === 'empresa' ? 'EST' : 'REN');
      const validoAte = Date.now() + (tipo === 'empresa' ? 15 : 365) * DIA;
      const convite = { tipo, empresaId: emp.id, empresaNome: emp.nome, status: 'pendente', dias, criadoEm: FV.serverTimestamp(), criadoPor: auth.currentUser.uid, validoAte: TS.fromMillis(validoAte) };
      try {
        await comLog(tipo === 'empresa' ? 'gerar_codigo' : 'gerar_renovacao', emp,
          `Código ${codigo}, ${dias} dias${plano ? `, plano ${plano.nome}` : ''}, ${cf.format(pag.valor)} (${pag.forma}, ${pag.pago ? 'pago' : 'pendente'})`, (b) => {
            state.convites.filter((c) => c.empresaId === emp.id && c.tipo === tipo).forEach((c) => {
              b.update(db.collection('convites').doc(c.id), { status: 'cancelado' });
              const cob = state.cobrancas.find((x) => x.id === c.id && x.status === 'pendente');
              if (cob) b.update(db.collection('cobrancas').doc(cob.id), { status: 'cancelado', canceladoEm: FV.serverTimestamp() });
            });
            b.set(db.collection('convites').doc(codigo), convite);
            novaCobranca(b, codigo, tipo, emp, dias, plano, pag);
            const novoPer = f.periodo.value;
            const atualiza = plano && Ass.ehNivel(plano) ? (!manter || novoPer !== (periodoDe(emp) || {}).id) : (!manter && (plano ? plano.id : null) !== (emp.planoId || null));
            if (atualiza) b.update(db.collection('empresas').doc(emp.id), camposPlano(plano, novoPer));
          });
        recarregarDetalhe();
        mostrarCodigo(emp, { ...convite, id: codigo, validoAte });
      } catch (x) { erroForm(f, msgErro(x)); btn.disabled = false; }
    });
  }

  /* ---------- pagamentos ---------- */
  function modalPagamento(c) {
    if (!c) return;
    const m = openModal(`
      <form id="f-pag" novalidate>
        ${head('Registrar pagamento')}
        <div class="modal-body grid-2">
          <p class="confirm-text span-2">${esc(c.empresaNome)}: ${c.tipo === 'empresa' ? 'ativação' : 'renovação'} de ${plural(num(c.dias), 'dia', 'dias')}, código ${esc(c.codigo)}.</p>
          <label class="field"><span>Valor recebido (R$)</span><input name="valor" type="number" min="0" step="0.01" value="${num(c.valor)}"></label>
          <label class="field"><span>Forma de pagamento</span><select name="forma">${FORMAS.map((x) => `<option ${x === c.forma ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
          <label class="field"><span>Data do pagamento</span><input name="data" type="date" value="${hojeStr()}" max="${hojeStr()}"></label>
          <p class="form-error span-2" role="alert" hidden></p>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="fechar">Cancelar</button><button class="btn btn-primary" type="submit">Confirmar pagamento</button></footer>
      </form>`);
    const f = $('#f-pag', m);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!f.data.value) return erroForm(f, 'Informe a data do pagamento.');
      const pagoEm = new Date(f.data.value + 'T12:00:00').getTime();
      const valor = num(f.valor.value);
      try {
        await comLog('pagamento', empById(c.empresaId) || { id: c.empresaId, nome: c.empresaNome },
          `${cf.format(valor)} via ${f.forma.value} em ${dfd.format(pagoEm)}, código ${c.codigo}`, (b) => {
            b.update(db.collection('cobrancas').doc(c.id), { status: 'pago', valor, forma: f.forma.value, pagoEm: TS.fromMillis(pagoEm), registradoPor: auth.currentUser.email });
          });
        closeModal(); toast('Pagamento registrado.'); recarregarDetalhe();
      } catch (x) { erroForm(f, msgErro(x)); }
    });
  }

  async function cancelarCobranca(c) {
    if (!c) return;
    const conv = state.convites.find((x) => x.id === c.id);
    const ok = await confirmar('Cancelar cobrança', `A cobrança de ${cf.format(num(c.valor))} de <strong>${esc(c.empresaNome)}</strong> fica como cancelada.${conv ? ` O código ${esc(conv.id)}, que ainda não foi usado, também deixa de funcionar.` : ''}`, 'Cancelar cobrança');
    if (!ok) return;
    try {
      await comLog('cancelar_cobranca', empById(c.empresaId) || { id: c.empresaId, nome: c.empresaNome }, `${cf.format(num(c.valor))}, código ${c.codigo}`, (b) => {
        b.update(db.collection('cobrancas').doc(c.id), { status: 'cancelado', canceladoEm: FV.serverTimestamp() });
        if (conv) b.update(db.collection('convites').doc(conv.id), { status: 'cancelado' });
      });
      toast('Cobrança cancelada.'); recarregarDetalhe();
    } catch (x) { toast(msgErro(x), 'erro'); }
  }

  /* ---------- suporte ---------- */
  async function alterarAtivo(emp, ativo) {
    const ok = ativo
      ? await confirmar('Reativar empresa', `<strong>${esc(emp.nome)}</strong> volta a acessar o estoque normalmente.`, 'Reativar', false)
      : await confirmar('Suspender empresa', `Ninguém de <strong>${esc(emp.nome)}</strong> consegue acessar o estoque enquanto estiver suspensa. Os dados continuam guardados e voltam quando você reativar.`, 'Suspender');
    if (!ok) return;
    try {
      await comLog(ativo ? 'reativar' : 'suspender', emp, '', (b) => b.update(db.collection('empresas').doc(emp.id), { ativo }));
      toast(ativo ? 'Empresa reativada.' : 'Empresa suspensa.'); recarregarDetalhe();
    } catch (x) { toast(msgErro(x), 'erro'); }
  }

  function modalVencimento(emp) {
    const ate = toMs(emp.acessoAte);
    const iso = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const m = openModal(`
      <form id="f-venc" novalidate>
        ${head('Ajustar vencimento')}
        <div class="modal-body">
          <p class="confirm-text">Use para cortesias ou para compensar um problema. Para renovações pagas, prefira gerar um código de renovação, que registra a cobrança.</p>
          <label class="field"><span>Acesso liberado até o fim do dia</span><input name="data" type="date" value="${ate ? iso(ate) : iso(Date.now() + 30 * DIA)}"></label>
          <label class="field"><span>Motivo</span><input name="motivo" maxlength="160" placeholder="Ex.: 7 dias de cortesia pela instabilidade de 12/10"></label>
          <p class="form-error" role="alert" hidden></p>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="fechar">Cancelar</button><button class="btn btn-primary" type="submit">Salvar vencimento</button></footer>
      </form>`);
    const f = $('#f-venc', m);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!f.data.value) return erroForm(f, 'Escolha a data.');
      if (!f.motivo.value.trim()) return erroForm(f, 'Informe o motivo. Ele fica no histórico.');
      const novo = new Date(f.data.value + 'T23:59:59').getTime();
      try {
        await comLog('vencimento', emp, `De ${ate ? dfd.format(ate) : 'sem data'} para ${dfd.format(novo)}. Motivo: ${f.motivo.value.trim()}`,
          (b) => b.update(db.collection('empresas').doc(emp.id), { acessoAte: TS.fromMillis(novo) }));
        closeModal(); toast('Vencimento ajustado.'); recarregarDetalhe();
      } catch (x) { erroForm(f, msgErro(x)); }
    });
  }

  function modalLimite(emp) {
    const atual = num(emp.maxUsuarios) || MAX_USUARIOS_PADRAO;
    const m = openModal(`
      <form id="f-lim" novalidate>
        ${head('Limite de usuários')}
        <div class="modal-body">
          <p class="confirm-text"><strong>${esc(emp.nome)}</strong> tem ${plural(num(emp.totalUsuarios), 'usuário', 'usuários')} hoje. O plano define o limite, mas você pode dar uma exceção aqui.</p>
          <label class="field"><span>Máximo de usuários, contando o responsável</span><input name="max" type="number" min="1" max="100" step="1" value="${atual}"></label>
          <p class="form-error" role="alert" hidden></p>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="fechar">Cancelar</button><button class="btn btn-primary" type="submit">Salvar limite</button></footer>
      </form>`);
    const f = $('#f-lim', m);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const max = Math.round(num(f.max.value));
      if (max < 1) return erroForm(f, 'O limite precisa ser pelo menos 1.');
      if (max < num(emp.totalUsuarios)) return erroForm(f, `A empresa já tem ${emp.totalUsuarios} usuários. Remova alguém antes de baixar o limite para ${max}.`);
      try {
        await comLog('limite', emp, `De ${atual} para ${max} usuários`, (b) => b.update(db.collection('empresas').doc(emp.id), { maxUsuarios: max }));
        closeModal(); toast('Limite atualizado.');
      } catch (x) { erroForm(f, msgErro(x)); }
    });
  }

  function modalTrocarPlano(emp) {
    const m = openModal(`
      <form id="f-tplano" novalidate>
        ${head('Trocar plano')}
        <div class="modal-body">
          <p class="confirm-text">A troca vale na hora: recursos, limite de usuários e limite de produtos passam a ser os do novo plano. O vencimento não muda; para cobrar a diferença, gere um código de renovação.</p>
          <div class="grid-2">
            <label class="field"><span>Novo plano</span>${selectPlano(emp.planoId, false)}</label>
            <label class="field"><span>Período</span>${selectPeriodo((periodoDe(emp) || Ass.PERIODOS[0]).id)}</label>
          </div>
          <p class="form-error" role="alert" hidden></p>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="fechar">Cancelar</button><button class="btn btn-primary" type="submit">Trocar plano</button></footer>
      </form>`);
    const f = $('#f-tplano', m);
    const travaPeriodo = () => { const q = planoById(f.plano.value); f.periodo.disabled = Boolean(q && Ass.ehLegado(q)); };
    f.plano.addEventListener('change', travaPeriodo); travaPeriodo();
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const p = planoById(f.plano.value);
      const campos = camposPlano(p, f.periodo.value);
      if (campos.maxUsuarios && campos.maxUsuarios < num(emp.totalUsuarios)) {
        if (!window.confirm(`O plano ${p.nome} permite ${campos.maxUsuarios} usuários, mas a empresa tem ${emp.totalUsuarios}. Ninguém perde o acesso, mas novas pessoas não poderão entrar. Continuar?`)) return;
      }
      try {
        await comLog('plano', emp, `De ${emp.planoNome || 'sem plano'} para ${p ? p.nome : 'sem plano'}`, (b) => b.update(db.collection('empresas').doc(emp.id), campos));
        closeModal(); toast('Plano trocado.');
      } catch (x) { erroForm(f, msgErro(x)); }
    });
  }

  function modalContato(emp) {
    const m = openModal(`
      <form id="f-cont" novalidate>
        ${head('Dados de contato')}
        <div class="modal-body grid-2">
          <label class="field"><span>Nome do contato</span><input name="contatoNome" maxlength="60" value="${esc(emp.contatoNome)}"></label>
          <label class="field"><span>WhatsApp</span><input name="contatoTelefone" inputmode="tel" maxlength="20" value="${esc(fmtFone(emp.contatoTelefone))}"></label>
          <label class="field"><span>E-mail</span><input name="contatoEmail" type="email" maxlength="120" value="${esc(emp.contatoEmail)}"></label>
          <label class="field"><span>CNPJ</span><input name="cnpj" maxlength="18" inputmode="numeric" value="${esc(fmtCnpj(emp.cnpj))}"></label>
          <p class="form-error span-2" role="alert" hidden></p>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="fechar">Cancelar</button><button class="btn btn-primary" type="submit">Salvar</button></footer>
      </form>`, true);
    const f = $('#f-cont', m);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const dados = { contatoNome: f.contatoNome.value.trim(), contatoTelefone: digitos(f.contatoTelefone.value), contatoEmail: f.contatoEmail.value.trim(), cnpj: digitos(f.cnpj.value) };
      try {
        await comLog('contato', emp, '', (b) => b.update(db.collection('empresas').doc(emp.id), dados));
        closeModal(); toast('Contato atualizado.'); recarregarDetalhe();
      } catch (x) { erroForm(f, msgErro(x)); }
    });
  }

  async function conviteEquipe(emp) {
    const pend = state.convites.filter((c) => c.empresaId === emp.id && c.tipo === 'membro').length;
    const max = num(emp.maxUsuarios) || MAX_USUARIOS_PADRAO;
    if (num(emp.totalUsuarios) + pend >= max) return toast(`Sem vagas: ${emp.totalUsuarios} usuários e ${pend} convites pendentes para um limite de ${max}.`, 'erro');
    const codigo = gerarCodigo('EQP');
    const validoAte = Date.now() + 7 * DIA;
    const convite = { tipo: 'membro', empresaId: emp.id, empresaNome: emp.nome, status: 'pendente', criadoPor: auth.currentUser.uid, criadoEm: FV.serverTimestamp(), validoAte: TS.fromMillis(validoAte) };
    try {
      await comLog('convite_equipe', emp, `Código ${codigo}`, (b) => b.set(db.collection('convites').doc(codigo), convite));
      recarregarDetalhe();
      mostrarCodigo(emp, { ...convite, id: codigo, validoAte });
    } catch (x) { toast(msgErro(x), 'erro'); }
  }

  async function transferir(emp, uid) {
    const D = state.det;
    const novo = D && D.membros.find((m) => m.id === uid);
    const antigo = D && D.membros.find((m) => m.papel === 'dono');
    if (!novo) return;
    const ok = await confirmar('Transferir responsável', `<strong>${esc(novo.nome || novo.email)}</strong> passa a ser o responsável por ${esc(emp.nome)}: personaliza o sistema, convida e remove pessoas e aplica códigos de renovação.${antigo ? ` ${esc(antigo.nome || antigo.email)} continua na equipe, sem esses poderes.` : ''}`, 'Transferir', false);
    if (!ok) return;
    try {
      await comLog('transferir', emp, `De ${antigo ? antigo.email : 'ninguém'} para ${novo.email}`, (b) => {
        const base = db.collection('empresas').doc(emp.id);
        b.update(base, { donoUid: novo.id, donoEmail: novo.email });
        b.update(base.collection('membros').doc(novo.id), { papel: 'dono' });
        b.update(db.collection('usuarios').doc(novo.id), { papel: 'dono' });
        if (antigo) {
          b.update(base.collection('membros').doc(antigo.id), { papel: 'membro' });
          b.update(db.collection('usuarios').doc(antigo.id), { papel: 'membro' });
        }
      });
      toast('Responsável transferido.'); recarregarDetalhe();
    } catch (x) { toast(msgErro(x), 'erro'); }
  }

  async function removerUsuario(emp, uid) {
    const m = state.det && state.det.membros.find((x) => x.id === uid);
    if (!m) return;
    const ok = await confirmar('Remover usuário', `<strong>${esc(m.nome || m.email)}</strong> perde o acesso a ${esc(emp.nome)} e a vaga fica livre. A conta dela continua existindo no Authentication e pode ser apagada pelo console, se quiser.`, 'Remover');
    if (!ok) return;
    try {
      await comLog('remover_usuario', emp, m.email, (b) => {
        b.delete(db.collection('empresas').doc(emp.id).collection('membros').doc(uid));
        b.delete(db.collection('usuarios').doc(uid));
        b.update(db.collection('empresas').doc(emp.id), { totalUsuarios: FV.increment(-1) });
      });
      toast('Usuário removido.'); recarregarDetalhe();
    } catch (x) { toast(msgErro(x), 'erro'); }
  }

  /* ---------- LGPD ---------- */
  const SUBCOLECOES = ['membros', 'produtos', 'categorias', 'fornecedores', 'movimentacoes', 'notas', 'locais', 'grades'];
  function limpar(v) {
    if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
    if (Array.isArray(v)) return v.map(limpar);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limpar(x)]));
    return v;
  }

  async function exportarEmpresa(emp, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Exportando…'; }
    try {
      const base = db.collection('empresas').doc(emp.id);
      const ler = async (q) => (await q.get()).docs.map((d) => ({ id: d.id, ...limpar(d.data()) }));
      const partes = await Promise.all(SUBCOLECOES.map((s) => ler(base.collection(s))));
      const dados = {
        exportadoEm: new Date().toISOString(), exportadoPor: auth.currentUser.email,
        empresa: { id: emp.id, ...limpar((await base.get()).data()) },
        ...Object.fromEntries(SUBCOLECOES.map((s, i) => [s, partes[i]])),
        cobrancas: await ler(db.collection('cobrancas').where('empresaId', '==', emp.id)),
        convites: await ler(db.collection('convites').where('empresaId', '==', emp.id))
      };
      baixar(`estokio-${slug(emp.nome)}-${hojeStr()}.json`, JSON.stringify(dados, null, 2), 'application/json');
      await comLog('exportar', emp, `${partes[1].length} produtos, ${partes[4].length} movimentações`);
      toast('Dados exportados.');
    } catch (x) { toast(msgErro(x), 'erro'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'Exportar dados (JSON)'; } }
  }

  function modalExcluir(emp) {
    const m = openModal(`
      <form id="f-excluir" novalidate>
        ${head('Excluir empresa e todos os dados')}
        <div class="modal-body">
          <p class="confirm-text">Isto apaga <strong>definitivamente</strong> o estoque, as movimentações, os fornecedores, as notas, os usuários e os convites de <strong>${esc(emp.nome)}</strong>. Não há como desfazer. As cobranças ficam guardadas por obrigação fiscal.</p>
          <p class="confirm-text">Se o cliente pediu uma cópia, exporte os dados antes.</p>
          <button type="button" class="btn" data-action="exportar" data-id="${emp.id}">Exportar dados antes (JSON)</button>
          <label class="field"><span>Para confirmar, digite o nome da empresa: ${esc(emp.nome)}</span><input name="confirma" autocomplete="off"></label>
          <label class="field"><span>Motivo</span><input name="motivo" maxlength="160" placeholder="Ex.: Pedido de exclusão do cliente por e-mail em 10/10"></label>
          <p class="progresso muted" id="exc-prog" hidden></p>
          <p class="form-error" role="alert" hidden></p>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="fechar">Cancelar</button><button class="btn btn-danger" type="submit">Excluir definitivamente</button></footer>
      </form>`);
    const f = $('#f-excluir', m);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (f.confirma.value.trim() !== emp.nome) return erroForm(f, 'O nome digitado não confere.');
      if (!f.motivo.value.trim()) return erroForm(f, 'Informe o motivo. Ele fica no histórico.');
      erroForm(f, '');
      const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      const prog = $('#exc-prog', m); prog.hidden = false;
      try {
        const emails = await excluirTudo(emp, (t) => { prog.textContent = t; });
        await comLog('excluir_empresa', emp, `Motivo: ${f.motivo.value.trim()}. Contas a apagar no Authentication: ${emails.join(', ') || 'nenhuma'}`);
        state.det = null;
        location.hash = '#/empresas';
        openModal(`${head('Empresa excluída')}
          <div class="modal-body"><p class="confirm-text">Os dados de <strong>${esc(emp.nome)}</strong> foram apagados.</p>
          ${emails.length ? `<p class="confirm-text">Para completar a exclusão, apague estas contas em Firebase Console > Authentication > Usuários (o painel não tem permissão para isso):</p>
          <textarea rows="${Math.min(6, emails.length + 1)}" readonly class="msg-box">${esc(emails.join('\n'))}</textarea>` : ''}</div>
          <footer class="modal-foot"><button class="btn btn-primary" data-action="fechar">Entendi</button></footer>`);
      } catch (x) { erroForm(f, msgErro(x)); btn.disabled = false; }
    });
  }

  async function excluirTudo(emp, avisar) {
    const base = db.collection('empresas').doc(emp.id);
    for (const s of ['produtos', 'categorias', 'fornecedores', 'movimentacoes', 'notas', 'locais', 'grades']) {
      let total = 0;
      for (;;) {
        const snap = await base.collection(s).limit(300).get();
        if (snap.empty) break;
        const b = db.batch(); snap.docs.forEach((d) => b.delete(d.ref)); await b.commit();
        total += snap.size;
        avisar(`Apagando ${s}: ${total}`);
      }
    }
    avisar('Apagando usuários e convites…');
    const membros = await base.collection('membros').get();
    const convites = await db.collection('convites').where('empresaId', '==', emp.id).get();
    const emails = membros.docs.map((d) => d.data().email).filter(Boolean);
    const refs = [];
    membros.docs.forEach((d) => { refs.push(d.ref); refs.push(db.collection('usuarios').doc(d.id)); });
    convites.docs.forEach((d) => refs.push(d.ref));
    for (let i = 0; i < refs.length; i += 300) {
      const b = db.batch(); refs.slice(i, i + 300).forEach((r) => b.delete(r)); await b.commit();
    }
    const extras = [];
    if (emp.cnpj) extras.push(db.collection('cnpjs').doc(digitos(emp.cnpj)));
    if (emp.donoEmail) extras.push(db.collection('testes').doc(emp.donoEmail));
    for (const r of extras) { try { await r.delete(); } catch (e) { /* pode não existir */ } }
    await base.delete();
    return emails;
  }

  /* ---------- exportações e configurações ---------- */
  function exportarCobrancas() {
    if (!state.cobrancas.length) return toast('Nenhuma cobrança para exportar.', 'erro');
    const ST = { pago: 'Pago', pendente: 'Pendente', cancelado: 'Cancelado' };
    baixarCSV(`estokio-cobrancas-${hojeStr()}.csv`, [
      ['Criada em', 'Empresa', 'Tipo', 'Plano', 'Dias', 'Valor (R$)', 'Forma', 'Situação', 'Pago em', 'Código'],
      ...state.cobrancas.slice().sort((a, b) => toMs(b.criadoEm) - toMs(a.criadoEm)).map((c) => [
        toMs(c.criadoEm) ? dfd.format(toMs(c.criadoEm)) : '', c.empresaNome, c.tipo === 'empresa' ? 'Ativação' : 'Renovação', c.planoNome || '',
        num(c.dias), num(c.valor), c.forma || '', ST[c.status] || c.status, toMs(c.pagoEm) ? dfd.format(toMs(c.pagoEm)) : '', c.codigo])
    ]);
  }

  function exportarHistorico() {
    const itens = (state.historico && state.historico.itens) || [];
    if (!itens.length) return toast('Nada para exportar.', 'erro');
    baixarCSV(`estokio-historico-admin-${hojeStr()}.csv`, [
      ['Quando', 'Ação', 'Empresa', 'Detalhes', 'Admin'],
      ...itens.map((h) => [toMs(h.criadoEm) ? df.format(toMs(h.criadoEm)) : '', ACOES[h.acao] || h.acao, h.empresaNome || '', h.detalhes || '', h.adminEmail])
    ]);
  }

  async function salvarConfig(f) {
    const dados = {
      tipoChave: f.tipoChave.value, chavePix: f.chavePix.value.trim(), nomeRecebedor: f.nomeRecebedor.value.trim(), cidadeRecebedor: f.cidadeRecebedor.value.trim(),
      whatsappSuporte: digitos(f.whatsappSuporte.value), urlApp: f.urlApp.value.trim().replace(/\/+$/, ''), mensagemExtra: f.mensagemExtra.value.trim()
    };
    if (dados.chavePix && (!dados.nomeRecebedor || !dados.cidadeRecebedor)) return erroForm(f, 'Com chave Pix, informe também o nome e a cidade de quem recebe.');
    if (dados.urlApp && !/^https?:\/\//.test(dados.urlApp)) return erroForm(f, 'O endereço precisa começar com https://');
    erroForm(f, '');
    try {
      await comLog('config', null, `Pix: ${dados.chavePix || 'vazio'}; endereço: ${dados.urlApp || 'padrão'}`,
        (b) => b.set(db.collection('config').doc('publico'), { ...dados, atualizadoEm: FV.serverTimestamp() }, { merge: true }));
      toast('Configurações salvas.');
    } catch (x) { erroForm(f, msgErro(x)); }
  }
})();
