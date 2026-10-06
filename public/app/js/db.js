/*
 * Estokio — camada de dados (multiempresa)
 *
 * Estrutura no Firestore:
 *   admins/{uid}                         administradores master (criados à mão no console)
 *   convites/{codigo}                    códigos EST-… (ativar empresa), EQP-… (entrar na equipe)
 *                                        e REN-… (renovar o acesso: soma dias ao vencimento)
 *   usuarios/{uid}                       { empresaId, papel: dono|membro, email, nome }
 *   empresas/{empresaId}                 { nome, cnpj, telefone, cidade, logo (base64), corPrimaria,
 *                                          corDestaque, ativo, configurado, donoUid, donoEmail,
 *                                          totalUsuarios, maxUsuarios, acessoAte }
 *   empresas/{id}/membros/{uid}          { nome, email, papel, convite, entrouEm }
 *   empresas/{id}/produtos/{id}
 *   empresas/{id}/categorias/{id}
 *   empresas/{id}/movimentacoes/{id}
 *   empresas/{id}/fornecedores/{id}      { nome, cnpj, contato, telefone, email, observacoes }
 *   empresas/{id}/notas/{chaveNFe}       notas fiscais já lançadas (impede lançar a mesma nota duas vezes)
 *   planos/{id}                          catálogo de planos (Básico, Pro, Premium), definido pelo admin
 *   pedidos/{id}                         pedidos de pagamento por Pix (o admin confirma)
 *   testes/{email}, cnpjs/{documento}    impedem mais de um teste grátis por pessoa/empresa
 *   config/publico                       chave Pix e WhatsApp do suporte
 *   empresas/{id}/locais/{id}            lojas e depósitos (Multiloja, plano Premium)
 *   empresas/{id}/grades/{id}            modelos com variações de tamanho e cor (Grade, plano Pro)
 * Produto: controlaValidade + lotes[] (plano Pro); estoques { localId: qtd } (Multiloja).
 *
 * Sem configuração do Firebase, roda em MODO DEMONSTRAÇÃO (localStorage).
 */
(function () {
  'use strict';

  const cfg = window.ESTOKIO_FIREBASE_CONFIG || {};
  // ?demo=1 abre a apresentação comercial: loja fictícia, só no navegador, sem login e sem Firebase
  const apresentacao = (() => { try { return new URLSearchParams(location.search).has('demo'); } catch (e) { return false; } })();
  const useFirebase = !apresentacao && Boolean(cfg.apiKey && cfg.projectId && window.firebase);
  const MAX_USUARIOS = 5;
  const DIA = 864e5;

  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const round3 = (n) => Math.round(n * 1000) / 1000;
  const erro = (msg, code) => Object.assign(new Error(msg), { code: code || 'estokio' });

  const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem 0, O, 1, I (evita confusão ao digitar)
  function gerarCodigo(prefixo) {
    const b = new Uint8Array(12);
    crypto.getRandomValues(b);
    let s = '';
    for (let i = 0; i < 12; i++) { s += ALFABETO[b[i] % 32]; if (i === 3 || i === 7) s += '-'; }
    return `${prefixo}-${s}`;
  }
  function normalizarCodigo(c) {
    const s = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (s.length === 15 && /^(EST|EQP|REN)/.test(s)) return `${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7, 11)}-${s.slice(11)}`;
    return s;
  }

  function calcularSaldo(antes, tipo, quantidade) {
    const q = num(quantidade);
    if (tipo === 'entrada') {
      if (q <= 0) throw erro('Informe uma quantidade maior que zero.');
      return round3(antes + q);
    }
    if (tipo === 'saida') {
      if (q <= 0) throw erro('Informe uma quantidade maior que zero.');
      if (q > antes) throw erro(`Saída maior que o estoque disponível (${antes}).`);
      return round3(antes - q);
    }
    if (tipo === 'ajuste') {
      if (q < 0) throw erro('A quantidade contada não pode ser negativa.');
      if (q === antes) throw erro('A quantidade contada é igual ao estoque atual.');
      return round3(q);
    }
    throw erro('Tipo de movimentação inválido.');
  }

  /* ---------------- movimentação com lotes e locais ---------------- */
  const novoIdLote = () => Math.random().toString(36).slice(2, 10);
  const somaMapa = (o) => round3(Object.values(o || {}).reduce((s, v) => s + num(v), 0));
  /** Estoque por local. Produtos antigos (sem mapa) têm tudo no local padrão. */
  function estoquesDe(p, padrao) {
    if (p.estoques && typeof p.estoques === 'object' && Object.keys(p.estoques).length) return { ...p.estoques };
    return padrao ? { [padrao]: num(p.quantidade) } : {};
  }
  /** Lotes do produto. A diferença para o total vira o lote "Sem lote" (produtos que já tinham estoque). */
  function lotesDe(p) {
    const ls = Array.isArray(p.lotes) ? p.lotes.map((l) => ({ ...l, quantidade: num(l.quantidade) })) : [];
    const resto = round3(num(p.quantidade) - ls.reduce((s, l) => s + l.quantidade, 0));
    if (resto > 0.0005) {
      const sem = ls.find((l) => l.id === 'semlote');
      if (sem) sem.quantidade = round3(sem.quantidade + resto);
      else ls.push({ id: 'semlote', lote: 'Sem lote', validade: null, quantidade: resto });
    }
    return ls.filter((l) => l.quantidade > 0.0005);
  }
  const ordemFEFO = (a, b) => (a.validade || Infinity) - (b.validade || Infinity);

  /**
   * Aplica uma movimentação ao produto e devolve os novos valores.
   * m: { tipo, quantidade, localId?, localPadrao?, lote?: { lote, validade }, loteId? }
   * - Com locais: a quantidade vale para o local; ajuste é a contagem daquele local.
   * - Com validade: entrada cria/soma o lote; saída consome o lote escolhido ou o que vence primeiro.
   */
  function movimentar(p, m) {
    const antes = num(p.quantidade);
    const q = num(m.quantidade);
    const r = { antes };
    const localId = m.localId || (p.estoques && Object.keys(p.estoques).length ? m.localPadrao : null);
    if (localId) {
      const est = estoquesDe(p, m.localPadrao || localId);
      const noLocal = num(est[localId]);
      let novo;
      if (m.tipo === 'ajuste') {
        if (q < 0) throw erro('A quantidade contada não pode ser negativa.');
        if (q === noLocal) throw erro('A quantidade contada é igual ao estoque deste local.');
        novo = q;
      } else {
        try { novo = calcularSaldo(noLocal, m.tipo, q); }
        catch (e) { if (/maior que o estoque/.test(e.message)) throw erro(`Saída maior que o estoque deste local (${noLocal}).`); throw e; }
      }
      est[localId] = round3(novo);
      r.estoques = est;
      r.localId = localId;
      r.depois = somaMapa(est);
    } else {
      r.depois = calcularSaldo(antes, m.tipo, q);
    }
    if (p.controlaValidade) {
      const lotes = lotesDe(p);
      const delta = round3(r.depois - antes);
      if (delta > 0) {
        const lote = String((m.lote && m.lote.lote) || '').trim();
        if (!lote) throw erro('Este produto controla validade: informe o lote da entrada.');
        const validade = m.lote.validade ? num(m.lote.validade) : null;
        const ja = lotes.find((l) => l.lote === lote && (l.validade || null) === validade);
        if (ja) ja.quantidade = round3(ja.quantidade + delta);
        else lotes.push({ id: novoIdLote(), lote, validade, quantidade: delta });
        r.lotesMov = [{ lote, validade, quantidade: delta }];
      } else if (delta < 0) {
        let falta = -delta;
        const ordem = lotes.slice().sort(ordemFEFO);
        if (m.loteId) {
          const alvo = lotes.find((l) => l.id === m.loteId);
          if (!alvo) throw erro('Lote não encontrado.');
          if (alvo.quantidade + 0.0005 < falta) throw erro(`O lote ${alvo.lote} tem só ${alvo.quantidade}.`);
          ordem.splice(ordem.indexOf(alvo), 1); ordem.unshift(alvo);
        }
        r.lotesMov = [];
        for (const l of ordem) {
          if (falta <= 0.0005) break;
          const usa = round3(Math.min(l.quantidade, falta));
          l.quantidade = round3(l.quantidade - usa);
          falta = round3(falta - usa);
          r.lotesMov.push({ lote: l.lote, validade: l.validade || null, quantidade: usa });
        }
      }
      r.lotes = lotes.filter((l) => l.quantidade > 0.0005);
    }
    return r;
  }
  /** Campos a gravar no produto e na movimentação a partir do resultado. */
  function camposMov(r, m) {
    const prod = { quantidade: r.depois };
    if (r.lotes) prod.lotes = r.lotes;
    if (r.estoques) prod.estoques = r.estoques;
    const mov = {};
    if (r.lotesMov) mov.lotes = r.lotesMov;
    if (r.localId) { mov.localId = r.localId; mov.localNome = m.localNome || ''; }
    return { prod, mov };
  }
  function transferencia(p, t) {
    const q = num(t.quantidade);
    if (!t.de || !t.para || t.de === t.para) throw erro('Escolha locais de origem e destino diferentes.');
    if (q <= 0) throw erro('Informe uma quantidade maior que zero.');
    const est = estoquesDe(p, t.localPadrao);
    if (q > num(est[t.de]) + 0.0005) throw erro(`Transferência maior que o estoque de ${t.deNome || 'origem'} (${num(est[t.de])}).`);
    est[t.de] = round3(num(est[t.de]) - q);
    est[t.para] = round3(num(est[t.para]) + q);
    return est;
  }

  /* ---------------- kits ---------------- */
  /** Itens de um kit para vender q kits: [{ produtoId, qtd, total }] */
  function planoKit(kit, q) {
    q = num(q);
    if (q <= 0) throw erro('Informe a quantidade de kits.');
    const itens = Array.isArray(kit.kit) ? kit.kit : [];
    if (!itens.length) throw erro('Este kit não tem itens. Edite o kit.');
    return itens.map((i) => ({ produtoId: i.produtoId, qtd: num(i.qtd), total: round3(num(i.qtd) * q) }));
  }
  function calcularItemKit(p, item, k, padrao) {
    try {
      return { p, r: movimentar(p, { tipo: 'saida', quantidade: item.total, localId: k.localId, localPadrao: k.localPadrao || padrao }) };
    } catch (e) {
      throw erro(`Falta ${p.nome}: o kit precisa de ${item.total} e ${/local/.test(e.message) ? 'este local' : 'o estoque'} não tem o suficiente.`);
    }
  }
  const obsKit = (kit, k) => `Kit ${kit.nome} (${num(k.quantidade)})${k.observacao ? `: ${k.observacao}` : ''}`;

  function validarConvite(c) {
    if (c.status === 'usado') throw erro('Este código já foi usado.');
    if (c.status !== 'pendente') throw erro('Este código foi cancelado. Peça um novo.');
    if (c.validoAte && c.validoAte < Date.now()) throw erro('Este código expirou. Peça um novo.');
    return c;
  }

  const comum = { MAX_USUARIOS, DIA, normalizarCodigo, gerarCodigo };
  const nrm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const obsNota = (n) => `NF-e ${n.numero}${n.serie ? `/${n.serie}` : ''}, ${n.fornecedor.nome}`;

  /** Novo vencimento: os dias do código somam ao prazo atual (ou a partir de hoje, se já venceu). */
  const novoVencimento = (acessoAte, dias) => Math.max(Date.now(), num(acessoAte)) + num(dias) * DIA;

  /* ================================================================== */
  /* Firebase                                                            */
  /* ================================================================== */
  function firebaseStore() {
    firebase.initializeApp(cfg);
    let store = null;
    const auth = firebase.auth();
    const db = firebase.firestore();
    db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

    const FV = firebase.firestore.FieldValue;
    const ts = () => FV.serverTimestamp();
    let eid = null;
    let localPadrao = null;
    let verCusto = false;
    const empRef = () => db.collection('empresas').doc(eid);
    const sub = (n) => empRef().collection(n);

    function toPlain(doc) {
      const o = { id: doc.id, ...doc.data({ serverTimestamps: 'estimate' }) };
      for (const k of Object.keys(o)) {
        if (o[k] && typeof o[k].toDate === 'function') o[k] = o[k].toDate().getTime();
      }
      return o;
    }
    const mapUser = (u) => (u ? { uid: u.uid, email: u.email, name: u.displayName || '' } : null);

    /** Executa gravações em lotes de até 200 operações (o Firestore aceita 500 por lote). */
    /*
     * ORÇAMENTO DE CONSULTAS DAS REGRAS.
     * O Firestore deixa as regras consultar outros documentos (get/exists) no máximo 20 vezes por lote ou transação. Cada
     * gravação gasta 2 consultas (a empresa e o membro; 3 em grade e NF-e), então um lote leva poucas gravações. Lote ou
     * transação grande demais é recusado com "sem permissão", mesmo para o responsável. Por isso tudo aqui é fatiado.
     * O número de consultas de cada gravação é medido nas regras reais por tools/regras/orcamento.js.
     */
    const ORCAMENTO_CONSULTAS = 18;                                         // 20 do Firestore, com 2 de folga
    const CONSULTAS_POR_ESCRITA = 2;
    const MAX_ESCRITAS = Math.floor(ORCAMENTO_CONSULTAS / CONSULTAS_POR_ESCRITA);   // 9 gravações por lote ou transação
    const LOTES_SIMULTANEOS = 4;

    /** Quantas gravações uma operação faz (executa a operação num lote de mentira). */
    function contarEscritas(op) {
      let n = 0;
      const falso = { set() { n++; return falso; }, update() { n++; return falso; }, delete() { n++; return falso; } };
      op(falso);
      return n;
    }
    /** Junta operações em grupos de até MAX_ESCRITAS gravações, mantendo cada operação inteira no mesmo grupo. */
    function agrupar(ops) {
      const grupos = []; let atual = { ops: [], escritas: 0 };
      for (const op of ops) {
        const n = contarEscritas(op);
        if (atual.ops.length && atual.escritas + n > MAX_ESCRITAS) { grupos.push(atual); atual = { ops: [], escritas: 0 }; }
        atual.ops.push(op); atual.escritas += n;
      }
      if (atual.ops.length) grupos.push(atual);
      return grupos;
    }
    /** Erro de uma etapa que falhou depois de outras já gravadas: diz o que foi feito, para a pessoa não repetir às cegas. */
    function falhaParcial(e, feitos, total, oQue) {
      const motivo = e && (e.code === 'permission-denied' || /permission/i.test(e.code || '')) ? 'O Firebase negou a gravação (sem permissão).' : (e && e.message) || 'Não foi possível gravar.';
      const nota = feitos ? ` Atenção: ${feitos} de ${total} ${oQue} já foram gravados; confira o histórico antes de repetir.` : '';
      const novo = erro(motivo + nota);
      novo.original = e; novo.parcial = feitos;
      return novo;
    }
    /** Executa as operações em lotes pequenos, alguns ao mesmo tempo. Em caso de erro, diz quantas já foram gravadas. */
    async function emLotes(ops, aoAvancar) {
      const grupos = agrupar(ops);
      let proximo = 0, gravadas = 0, falha = null;
      const trabalhador = async () => {
        while (!falha) {
          const i = proximo++;
          if (i >= grupos.length) return;
          const b = db.batch();
          grupos[i].ops.forEach((f) => f(b));
          try { await b.commit(); gravadas += grupos[i].ops.length; aoAvancar(grupos[i].ops.length); }
          catch (e) { falha = e; }
        }
      };
      await Promise.all(Array.from({ length: Math.min(LOTES_SIMULTANEOS, grupos.length) }, trabalhador));
      if (falha) { falha.gravadas = gravadas; falha.total = ops.length; throw falha; }
    }

    /**
     * Produtos + custos. Quem pode ver custo também assina custos/ e recebe o custo mesclado.
     * Produtos antigos com o campo custo no próprio documento são migrados para custos/ (uma vez).
     * Quem não pode ver custo recebe os produtos sem esse campo.
     */
    let migrouCustos = false;
    function assinarProdutos(cb, onErr) {
      let lista = [], custos = null;
      const emitir = () => {
        if (verCusto && custos === null) return;
        cb(lista.map((p) => {
          const { custo, ...resto } = p;
          if (!verCusto) return resto;
          const c = custos[p.id];
          return { ...resto, custo: c !== undefined ? c : num(custo) };
        }));
      };
      const unsubs = [sub('produtos').onSnapshot((s) => {
        lista = s.docs.map(toPlain);
        emitir();
        if (verCusto && !migrouCustos) migrarCustos(lista);
      }, onErr)];
      if (verCusto) unsubs.push(sub('custos').onSnapshot((s) => { custos = {}; s.docs.forEach((d) => { custos[d.id] = num(d.data().custo); }); emitir(); }, onErr));
      return () => unsubs.forEach((u) => u());
    }
    async function migrarCustos(lista) {
      const antigos = lista.filter((p) => p.custo !== undefined);
      migrouCustos = true;
      if (!antigos.length) return;
      const ops = antigos.map((p) => (b) => {
        b.set(sub('custos').doc(p.id), { custo: num(p.custo), atualizadoEm: ts() }, { merge: true });
        b.update(sub('produtos').doc(p.id), { custo: FV.delete() });
      });
      try { await emLotes(ops, () => {}); } catch (e) { migrouCustos = false; console.warn('Migração de custos adiada:', e.message); }
    }

    store = {
      ...comum,
      mode: 'firebase',
      projectId: cfg.projectId,

      /* ---- autenticação ---- */
      onAuth: (cb) => auth.onAuthStateChanged((u) => cb(mapUser(u))),
      login: (email, senha) => auth.signInWithEmailAndPassword(email, senha),
      async register(nome, email, senha, termosVersao) {
        const cred = await auth.createUserWithEmailAndPassword(email, senha);
        if (nome) await cred.user.updateProfile({ displayName: nome });
        // Prova de aceite dos Termos de Uso e da Política de Privacidade, com a data do servidor (não dá para forjar).
        // Best-effort: se isso falhar, a conta já foi criada e não travamos o cadastro por causa disso.
        if (termosVersao) {
          try { await db.collection('aceites').doc(cred.user.uid).set({ uid: cred.user.uid, email, versao: termosVersao, aceitoEm: ts() }); }
          catch (e) { /* ignora: a regra ou a rede podem falhar aqui sem impedir o cadastro */ }
        }
      },
      resetPassword: (email) => auth.sendPasswordResetEmail(email),
      logout: () => auth.signOut(),

      /** Contas do administrador master (coleção admins) vão para o painel admin. */
      async ehAdmin(uid) {
        try { return (await db.collection('admins').doc(uid).get()).exists; } catch (e) { return false; }
      },

      /* ---- vínculo usuário ↔ empresa ---- */
      async getPerfil(uid) {
        const s = await db.collection('usuarios').doc(uid).get();
        return s.exists ? toPlain(s) : null;
      },
      setEmpresa(id) { eid = id; },

      async consultarCodigo(codigo) {
        const id = normalizarCodigo(codigo);
        if (!/^(EST|EQP|REN)-/.test(id)) throw erro('Código inválido. Ele começa com EST, EQP ou REN.');
        const s = await db.collection('convites').doc(id).get();
        if (!s.exists) throw erro('Código não encontrado. Confira se digitou certo.');
        return validarConvite(toPlain(s));
      },

      async resgatarCodigo(c, user) {
        const eRef = db.collection('empresas').doc(c.empresaId);
        const papel = c.tipo === 'empresa' ? 'dono' : (c.papel || 'membro');
        const batch = db.batch();
        if (papel === 'dono') {
          batch.update(eRef, {
            donoUid: user.uid, donoEmail: user.email, conviteUsado: c.id, totalUsuarios: 1, ativadoEm: ts(),
            acessoAte: firebase.firestore.Timestamp.fromMillis(Date.now() + (num(c.dias) || 30) * DIA)
          });
        } else {
          batch.update(eRef, { totalUsuarios: FV.increment(1) });
        }
        batch.set(eRef.collection('membros').doc(user.uid), { nome: user.name || '', email: user.email, papel, convite: c.id, entrouEm: ts() });
        batch.update(db.collection('convites').doc(c.id), { status: 'usado', usadoPor: user.uid, usadoEmail: user.email, usadoEm: ts() });
        batch.set(db.collection('usuarios').doc(user.uid), { empresaId: c.empresaId, papel, email: user.email, nome: user.name || '', criadoEm: ts() });
        try {
          await batch.commit();
        } catch (e) {
          if (e.code === 'permission-denied') {
            throw erro(papel === 'dono'
              ? 'Não foi possível ativar a empresa com este código. Ele pode ter sido usado, cancelado ou expirado.'
              : `Não foi possível entrar na equipe. A empresa já pode ter ${MAX_USUARIOS} usuários, ou o código não vale mais.`, e.code);
          }
          throw e;
        }
        return { empresaId: c.empresaId, papel };
      },

      /* ---- teste grátis criado pelo próprio cliente ---- */
      async criarTeste(dados, user) {
        const email = user.email;
        try {
          const t = await db.collection('testes').doc(email).get();
          if (t.exists) throw erro('Este e-mail já usou o teste grátis. Para continuar, use um código de acesso ou fale com o suporte do Estokio.');
        } catch (e) { if (e.code === 'estokio') throw e; }
        const eRef = db.collection('empresas').doc();
        const nome = user.name || '';
        const b = db.batch();
        b.set(eRef, {
          nome: dados.nome, cnpj: dados.cnpj, telefone: dados.telefone, cidade: dados.cidade || '',
          contatoNome: nome, contatoEmail: email, contatoTelefone: dados.telefone,
          logo: null, corPrimaria: '#16233a', corDestaque: '#f2b705',
          ativo: true, configurado: false, donoUid: user.uid, donoEmail: email, totalUsuarios: 1, maxUsuarios: 5,
          planoId: 'teste', planoNome: 'Teste grátis', planoPreco: 0, planoDias: 7, maxProdutos: 0,
          recursos: { ...window.EstokioAssinatura.TODOS }, pacotes: {}, origem: 'teste',
          acessoAte: firebase.firestore.Timestamp.fromMillis(Date.now() + 7 * DIA), criadoEm: ts(), ativadoEm: ts()
        });
        b.set(eRef.collection('membros').doc(user.uid), { nome, email, papel: 'dono', entrouEm: ts() });
        b.set(db.collection('usuarios').doc(user.uid), { empresaId: eRef.id, papel: 'dono', email, nome, criadoEm: ts() });
        b.set(db.collection('testes').doc(email), { empresaId: eRef.id, criadoEm: ts() });
        b.set(db.collection('cnpjs').doc(dados.cnpj), { empresaId: eRef.id, criadoEm: ts() });
        try { await b.commit(); }
        catch (e) {
          if (e.code === 'permission-denied') throw erro('Este CNPJ ou CPF já tem um teste ou uma conta no Estokio. Se é a sua empresa, fale com o suporte.', e.code);
          throw e;
        }
        return { empresaId: eRef.id, papel: 'dono' };
      },

      /* ---- catálogo, configuração pública e pedidos de pagamento ---- */
      watchPlanos: (cb, onErr) => db.collection('planos').onSnapshot((s) => cb(s.docs.map(toPlain)), onErr),
      watchConfig: (cb, onErr) => db.collection('config').doc('publico').onSnapshot((s) => cb(s.exists ? s.data() : {}), onErr),
      watchPedidos(cb, onErr) {
        return db.collection('pedidos').where('empresaId', '==', eid).where('status', '==', 'aguardando')
          .onSnapshot((s) => cb(s.docs.map(toPlain).sort((a, b) => b.criadoEm - a.criadoEm)), onErr);
      },
      async criarPedido(p, user) {
        const ref = db.collection('pedidos').doc();
        const dados = { ...p, empresaId: eid, status: 'aguardando', criadoPor: user.email, criadoEm: ts() };
        await ref.set(dados);
        return { id: ref.id, ...dados, criadoEm: Date.now() };
      },
      cancelarPedido: (id) => db.collection('pedidos').doc(id).update({ status: 'cancelado', canceladoEm: ts() }),

      /* ---- empresa ---- */
      watchEmpresa: (cb, onErr) => empRef().onSnapshot((s) => cb(s.exists ? toPlain(s) : null), onErr),
      watchMembro: (uid, cb, onErr) => sub('membros').doc(uid).onSnapshot((s) => cb(s.exists ? toPlain(s) : null), onErr),
      saveEmpresa: (campos) => empRef().update({ ...campos, atualizadoEm: ts() }),

      /* ---- último acesso (visto pelo admin para saber quem está usando) ---- */
      async registrarAcesso(uid) {
        const b = db.batch();
        b.update(empRef(), { ultimoAcesso: ts() });
        b.update(sub('membros').doc(uid), { ultimoAcesso: ts() });
        await b.commit();
      },

      /* ---- LGPD: todos os dados da empresa num objeto ---- */
      async exportarDados() {
        const limpar = (v) => {
          if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
          if (Array.isArray(v)) return v.map(limpar);
          if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limpar(x)]));
          return v;
        };
        const ler = async (nome) => (await sub(nome).get()).docs.map((d) => ({ id: d.id, ...limpar(d.data()) }));
        const emp = await empRef().get();
        const [membros, produtos, categorias, fornecedores, movimentacoes, notas] = await Promise.all(
          ['membros', 'produtos', 'categorias', 'fornecedores', 'movimentacoes', 'notas'].map(ler));
        return { exportadoEm: new Date().toISOString(), empresa: { id: emp.id, ...limpar(emp.data()) }, membros, produtos, categorias, fornecedores, movimentacoes, notas };
      },

      /* ---- renovação do acesso (somente responsável) ---- */
      async renovarAcesso(c, empresa, user) {
        const novo = novoVencimento(empresa.acessoAte, c.dias);
        const batch = db.batch();
        batch.update(empRef(), { acessoAte: firebase.firestore.Timestamp.fromMillis(novo), ultimaRenovacao: c.id, renovadoEm: ts() });
        batch.update(db.collection('convites').doc(c.id), { status: 'usado', usadoPor: user.uid, usadoEmail: user.email, usadoEm: ts() });
        try { await batch.commit(); }
        catch (e) {
          if (e.code === 'permission-denied') throw erro('Não foi possível aplicar a renovação. O código pode já ter sido usado ou ser de outra empresa.', e.code);
          throw e;
        }
        return novo;
      },

      /* ---- equipe (somente responsável) ---- */
      watchConvitesEquipe(cb, onErr) {
        return db.collection('convites')
          .where('empresaId', '==', eid).where('tipo', '==', 'membro').where('status', '==', 'pendente')
          .onSnapshot((s) => cb(s.docs.map(toPlain)), onErr);
      },
      async criarConviteEquipe(user, empresaNome, dias = 7, papel = 'estoquista') {
        const id = gerarCodigo('EQP');
        await db.collection('convites').doc(id).set({
          tipo: 'membro', empresaId: eid, empresaNome, status: 'pendente', papel,
          criadoPor: user.uid, criadoEm: ts(),
          validoAte: firebase.firestore.Timestamp.fromMillis(Date.now() + dias * 864e5)
        });
        return id;
      },
      cancelarConvite: (id) => db.collection('convites').doc(id).delete(),
      async removerMembro(uid) {
        const batch = db.batch();
        batch.delete(sub('membros').doc(uid));
        batch.delete(db.collection('usuarios').doc(uid));
        batch.update(empRef(), { totalUsuarios: FV.increment(-1), ultimoRemovido: uid });
        await batch.commit();
      },

      /* ---- estoque ---- */
      subscribe(nome, cb, onErr) {
        if (nome === 'produtos') return assinarProdutos(cb, onErr);
        let q = sub(nome);
        if (nome === 'movimentacoes') q = q.orderBy('criadoEm', 'desc').limit(1000);
        if (nome === 'notas') q = q.orderBy('criadoEm', 'desc').limit(30);
        if (nome === 'pedidosCompra' || nome === 'inventarios') q = q.orderBy('criadoEm', 'desc').limit(300);
        if (nome === 'solicitacoes') q = q.where('status', '==', 'pendente');
        return q.onSnapshot((snap) => cb(snap.docs.map(toPlain)), onErr);
      },

      /** Sonda as regras de segurança: o app novo lê custos/, que só tem regra na versão nova do firestore.rules. 'negado' = regras desatualizadas. */
      async sondarRegras() {
        try { await sub('custos').doc('_sonda').get(); return 'ok'; }
        catch (e) { return e && e.code === 'permission-denied' ? 'negado' : 'erro'; }
      },

      /* ---- papéis e custos ---- */
      /** Responsável e gerente recebem o custo (custos/{id}); os outros papéis nem o baixam. */
      configurarCustos(pode) { verCusto = Boolean(pode); },
      mudarPapel: (uid, papel) => sub('membros').doc(uid).update({ papel }),

      /* ---- ajustes pedidos para aprovação ---- */
      solicitarAjuste: (s, user) => sub('solicitacoes').add({ ...s, status: 'pendente', solicitadoPor: user.email, criadoEm: ts() }),
      async resolverSolicitacao(s, aprovar, user) {
        if (aprovar) {
          await store.addMovement({ produtoId: s.produtoId, tipo: 'ajuste', quantidade: s.quantidade, localId: s.localId || undefined, localNome: s.localNome || '',
            lote: s.lote || undefined, observacao: `${s.observacao ? `${s.observacao}. ` : ''}Pedido por ${s.solicitadoPor}` }, user);
        }
        await sub('solicitacoes').doc(s.id).update({ status: aprovar ? 'aprovado' : 'recusado', resolvidoPor: user.email, resolvidoEm: ts() });
      },

      /* ---- kits: a saída de um kit baixa cada item, numa operação só ---- */
      async venderKit(k, user) {
        // 1) Confere TODOS os itens antes de gravar qualquer um: se faltar um, nada é baixado
        const kit = await (async () => { const ks = await sub('produtos').doc(k.kitId).get(); if (!ks.exists) throw erro('Kit não encontrado.'); return ks.data(); })();
        const plano = planoKit(kit, k.quantidade);
        for (const item of plano) {
          const sn = await sub('produtos').doc(item.produtoId).get();
          if (!sn.exists) throw erro('Um item deste kit não existe mais. Edite o kit.');
          calcularItemKit(sn.data(), item, k, localPadrao);
        }
        // 2) Baixa em grupos: cada item grava o saldo e a saída (2 gravações), e o limite de gravações por transação é pequeno
        const porGrupo = Math.max(1, Math.floor(MAX_ESCRITAS / 2));
        let feitos = 0;
        for (let g = 0; g < plano.length; g += porGrupo) {
          const grupo = plano.slice(g, g + porGrupo);
          try {
            await db.runTransaction(async (tx) => {
              const refs = grupo.map((i) => sub('produtos').doc(i.produtoId));
              const snaps = [];
              for (const r of refs) snaps.push(await tx.get(r));
              const res = snaps.map((sn, i) => {
                if (!sn.exists) throw erro('Um item deste kit não existe mais. Edite o kit.');
                return calcularItemKit(sn.data(), grupo[i], k, localPadrao);
              });
              res.forEach(({ p, r }, i) => {
                const c = camposMov(r, k);
                tx.update(refs[i], { ...c.prod, atualizadoEm: ts() });
                tx.set(sub('movimentacoes').doc(), {
                  produtoId: refs[i].id, produtoNome: p.nome, sku: p.sku || '', tipo: 'saida', quantidade: grupo[i].total,
                  antes: r.antes, depois: r.depois, ...c.mov, kitId: k.kitId, kitNome: kit.nome, kitQtd: num(k.quantidade),
                  observacao: obsKit(kit, k), usuario: user.email, criadoEm: ts()
                });
              });
            });
            feitos += grupo.length;
          } catch (e) { throw falhaParcial(e, feitos, plano.length, 'itens do kit'); }
        }
      },

      /* ---- pedidos de compra ---- */
      async salvarPedidoCompra(p, user) {
        const { id, ...campos } = p;
        if (id) { await sub('pedidosCompra').doc(id).update({ ...campos, atualizadoEm: ts() }); return id; }
        const ref = await sub('pedidosCompra').add({ ...campos, criadoPor: user.email, criadoEm: ts(), atualizadoEm: ts() });
        return ref.id;
      },
      async receberPedido(r, user) {
        const pref = sub('pedidosCompra').doc(r.pedidoId);
        const ps0 = await pref.get();
        if (!ps0.exists) throw erro('Pedido não encontrado.');
        const ped0 = ps0.data();
        if (['recebido', 'cancelado'].includes(ped0.status)) throw erro('Este pedido já foi encerrado.');
        const alvos = r.itens.filter((x) => num(x.qtd) > 0);
        if (!alvos.length) throw erro('Informe a quantidade recebida de pelo menos um item.');
        // Quantos dias o fornecedor levou: o que a pessoa confirmou na tela, ou os dias desde que o pedido foi criado
        const criado = ped0.criadoEm && ped0.criadoEm.toMillis ? ped0.criadoEm.toMillis() : num(ped0.criadoEm);
        const dias = r.diasEntrega !== undefined && r.diasEntrega !== null && r.diasEntrega !== '' ? Math.max(0, Math.round(num(r.diasEntrega))) : Math.max(0, Math.round((Date.now() - criado) / DIA));
        // Cada item grava o saldo, a entrada e, às vezes, o custo; o pedido é atualizado a cada grupo (1 gravação)
        const comCusto = (a) => Boolean(r.atualizarCusto && verCusto && num((ped0.itens[a.idx] || {}).custo) > 0);
        const grupos = []; let atual = [], escritas = 1;
        for (const a of alvos) {
          const w = 2 + (comCusto(a) ? 1 : 0);
          if (atual.length && escritas + w > MAX_ESCRITAS) { grupos.push(atual); atual = []; escritas = 1; }
          atual.push(a); escritas += w;
        }
        if (atual.length) grupos.push(atual);
        let feitos = 0;
        for (const grupo of grupos) {
          try {
            await db.runTransaction(async (tx) => {
              const ps = await tx.get(pref);
              if (!ps.exists) throw erro('Pedido não encontrado.');
              const ped = ps.data();
              if (['recebido', 'cancelado'].includes(ped.status)) throw erro('Este pedido já foi encerrado.');
              const itens = ped.itens.map((i) => ({ ...i }));
              const snaps = [];
              for (const a of grupo) snaps.push(await tx.get(sub('produtos').doc(itens[a.idx].produtoId)));
              grupo.forEach((a, k) => {
                const it = itens[a.idx]; const sn = snaps[k];
                if (!sn.exists) throw erro(`O produto ${it.nome} não existe mais.`);
                const p = sn.data();
                const rr = movimentar(p, { tipo: 'entrada', quantidade: a.qtd, lote: a.lote, localId: r.localId, localPadrao: r.localPadrao || localPadrao });
                const c = camposMov(rr, r);
                tx.update(sn.ref, { ...c.prod, atualizadoEm: ts() });
                if (r.atualizarCusto && verCusto && num(it.custo) > 0) tx.set(sub('custos').doc(sn.id), { custo: num(it.custo), atualizadoEm: ts() }, { merge: true });
                tx.set(sub('movimentacoes').doc(), {
                  produtoId: sn.id, produtoNome: p.nome, sku: p.sku || '', tipo: 'entrada', quantidade: num(a.qtd), antes: rr.antes, depois: rr.depois, ...c.mov,
                  pedidoId: r.pedidoId, observacao: `Pedido ${ped.numero}, ${ped.fornecedorNome}`, usuario: user.email, criadoEm: ts()
                });
                it.recebido = round3(num(it.recebido) + num(a.qtd));
              });
              const completo = itens.every((i) => num(i.recebido) >= num(i.qtd));
              tx.update(pref, { itens, status: completo ? 'recebido' : 'parcial', recebidoEm: ts(), diasEntrega: dias, atualizadoEm: ts(), recebidoPor: user.email });
            });
            feitos += grupo.length;
          } catch (e) { throw falhaParcial(e, feitos, alvos.length, 'itens do pedido'); }
        }
      },

      /* ---- inventário (plano Pro) ---- */
      async salvarInventario(inv, user) {
        const { id, ...campos } = inv;
        if (id) { await sub('inventarios').doc(id).update({ ...campos, atualizadoEm: ts() }); return id; }
        const ref = await sub('inventarios').add({ ...campos, contagens: {}, status: 'aberto', criadoPor: user.email, criadoEm: ts(), atualizadoEm: ts() });
        return ref.id;
      },
      /** Cada contagem grava só o próprio item: várias pessoas podem contar ao mesmo tempo. */
      contarItem: (invId, produtoId, qtd, user) => sub('inventarios').doc(invId).update({
        [`contagens.${produtoId}`]: qtd === null ? FV.delete() : { qtd: num(qtd), por: user.email, em: Date.now() }, atualizadoEm: ts()
      }),


      async saveProduct(p, user) {
        const { id, quantidadeInicial, _obsInicial, _movExtra, custo, ...campos } = p;
        if (id) {
          const b = db.batch();
          b.update(sub('produtos').doc(id), { ...campos, atualizadoEm: ts() });
          if (custo !== undefined && verCusto) b.set(sub('custos').doc(id), { custo: num(custo), atualizadoEm: ts() }, { merge: true });
          await b.commit();
          return id;
        }
        const qtd = num(quantidadeInicial);
        const ref = sub('produtos').doc();
        const batch = db.batch();
        batch.set(ref, { ...campos, quantidade: qtd, criadoEm: ts(), atualizadoEm: ts(), criadoPor: user.email });
        if (custo !== undefined && verCusto) batch.set(sub('custos').doc(ref.id), { custo: num(custo), atualizadoEm: ts() });
        if (qtd > 0) {
          batch.set(sub('movimentacoes').doc(), {
            produtoId: ref.id, produtoNome: campos.nome, sku: campos.sku || '',
            tipo: 'entrada', quantidade: qtd, antes: 0, depois: qtd,
            ...(_movExtra || {}), observacao: _obsInicial || 'Estoque inicial', usuario: user.email, criadoEm: ts()
          });
        }
        await batch.commit();
        return ref.id;
      },

      deleteProduct: (id) => sub('produtos').doc(id).delete(),

      setLocalPadrao(id) { localPadrao = id || null; },

      async addMovement(m, user) {
        const pref = sub('produtos').doc(m.produtoId);
        const mref = sub('movimentacoes').doc();
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(pref);
          if (!snap.exists) throw erro('Produto não encontrado.');
          const p = snap.data();
          const r = movimentar(p, { ...m, localPadrao: m.localPadrao || localPadrao });
          const c = camposMov(r, m);
          tx.update(pref, { ...c.prod, atualizadoEm: ts() });
          tx.set(mref, {
            produtoId: m.produtoId, produtoNome: p.nome, sku: p.sku || '',
            tipo: m.tipo, quantidade: num(m.quantidade), antes: r.antes, depois: r.depois, ...c.mov,
            observacao: m.observacao || '', usuario: user.email, criadoEm: ts()
          });
        });
      },

      async transferir(t, user) {
        const pref = sub('produtos').doc(t.produtoId);
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(pref);
          if (!snap.exists) throw erro('Produto não encontrado.');
          const p = snap.data();
          const est = transferencia(p, { ...t, localPadrao: t.localPadrao || localPadrao });
          tx.update(pref, { estoques: est, atualizadoEm: ts() });
          tx.set(sub('movimentacoes').doc(), {
            produtoId: t.produtoId, produtoNome: p.nome, sku: p.sku || '', tipo: 'transferencia', quantidade: num(t.quantidade),
            antes: num(p.quantidade), depois: num(p.quantidade), de: t.de, deNome: t.deNome || '', para: t.para, paraNome: t.paraNome || '',
            observacao: t.observacao || '', usuario: user.email, criadoEm: ts()
          });
        });
      },

      /* ---- locais (Multiloja) e grades ---- */
      async saveLocal(l) {
        const { id, ...campos } = l;
        if (id) return sub('locais').doc(id).update({ ...campos, atualizadoEm: ts() });
        const ref = await sub('locais').add({ ...campos, criadoEm: ts() });
        return ref.id;
      },
      deleteLocal: (id) => sub('locais').doc(id).delete(),
      async salvarGrade(g, novas, atualizarIds, user) {
        const { id, ...campos } = g;
        const gref = id ? sub('grades').doc(id) : sub('grades').doc();
        const comum = { categoriaId: campos.categoriaId || '', fornecedorId: campos.fornecedorId || '', unidade: campos.unidade || 'un',
          custo: num(campos.custo), preco: num(campos.preco), estoqueMinimo: num(campos.estoqueMinimo) };
        const { custo: custoGrade, ...semCusto } = comum;
        // O modelo vai primeiro, sozinho (a regra de grade gasta 3 consultas); as variações vêm em lotes pequenos
        if (id) await gref.update({ ...campos, atualizadoEm: ts() }); else await gref.set({ ...campos, criadoEm: ts() });
        const ops = [];
        novas.forEach((v) => {
          const pref = sub('produtos').doc();
          ops.push((b) => {
            b.set(pref, { ...semCusto, nome: v.nome, sku: v.sku || '', codigoBarras: '', localizacao: '', descricao: '', gradeId: gref.id, variacao: v.variacao,
              quantidade: 0, criadoEm: ts(), atualizadoEm: ts(), criadoPor: user.email });
            if (verCusto) b.set(sub('custos').doc(pref.id), { custo: num(custoGrade), atualizadoEm: ts() });
          });
        });
        (atualizarIds || []).forEach((pid) => ops.push((b) => {
          b.update(sub('produtos').doc(pid), { ...semCusto, atualizadoEm: ts() });
          if (verCusto) b.set(sub('custos').doc(pid), { custo: num(custoGrade), atualizadoEm: ts() }, { merge: true });
        }));
        await emLotes(ops, () => {});
        return gref.id;
      },
      deleteGrade: (id) => sub('grades').doc(id).delete(),
      /** Histórico desde uma data, buscado em páginas de 1.000 (até 20.000 movimentações). */
      async movimentacoesDesde(ms) {
        const out = [];
        let q = sub('movimentacoes').where('criadoEm', '>=', firebase.firestore.Timestamp.fromMillis(ms)).orderBy('criadoEm', 'desc').limit(1000);
        for (let pagina = 0; pagina < 20; pagina++) {
          const s = await q.get();
          out.push(...s.docs.map(toPlain));
          if (s.docs.length < 1000) break;
          q = q.startAfter(s.docs[s.docs.length - 1]);
        }
        return out;
      },

      async saveCategory(c) {
        if (c.id) return sub('categorias').doc(c.id).update({ nome: c.nome });
        return sub('categorias').add({ nome: c.nome, criadoEm: ts() });
      },
      deleteCategory: (id) => sub('categorias').doc(id).delete(),

      /* ---- fornecedores ---- */
      async saveFornecedor(f) {
        const { id, ...campos } = f;
        if (id) return sub('fornecedores').doc(id).update({ ...campos, atualizadoEm: ts() });
        const ref = await sub('fornecedores').add({ ...campos, criadoEm: ts() });
        return ref.id;
      },
      deleteFornecedor: (id) => sub('fornecedores').doc(id).delete(),

      /* ---- importação de planilha ---- */
      async importarProdutos(plano, user, progresso = () => {}) {
        const catIds = {}, fornIds = {};
        const ops = [];
        plano.categoriasNovas.forEach((nome) => {
          const ref = sub('categorias').doc(); catIds[nrm(nome)] = ref.id;
          ops.push((b) => b.set(ref, { nome, criadoEm: ts() }));
        });
        plano.fornecedoresNovos.forEach((nome) => {
          const ref = sub('fornecedores').doc(); fornIds[nrm(nome)] = ref.id;
          ops.push((b) => b.set(ref, { nome, cnpj: '', contato: '', telefone: '', email: '', observacoes: '', criadoEm: ts() }));
        });
        const resolver = ({ _categoriaNome, _fornecedorNome, ...c }) => {
          if (_categoriaNome) c.categoriaId = catIds[nrm(_categoriaNome)] || '';
          if (_fornecedorNome) c.fornecedorId = fornIds[nrm(_fornecedorNome)] || '';
          return c;
        };
        plano.novos.forEach((n) => {
          const ref = sub('produtos').doc();
          const { custo, ...campos } = resolver(n.campos);
          const q = num(n.quantidadeInicial);
          // Produto com validade na planilha: já nasce com o lote inicial, para entrar na aba Validades
          const lotes = n.lote && q > 0 ? [{ id: novoIdLote(), lote: n.lote.lote, validade: n.lote.validade, quantidade: q }] : undefined;
          ops.push((b) => {
            b.set(ref, { ...campos, quantidade: q, ...(lotes ? { lotes } : {}), criadoEm: ts(), atualizadoEm: ts(), criadoPor: user.email });
            if (custo !== undefined) b.set(sub('custos').doc(ref.id), { custo: num(custo), atualizadoEm: ts() });
            if (q > 0) {
              b.set(sub('movimentacoes').doc(), {
                produtoId: ref.id, produtoNome: campos.nome, sku: campos.sku || '', tipo: 'entrada', quantidade: q,
                antes: 0, depois: q, ...(n.lote ? { lotes: [{ lote: n.lote.lote, validade: n.lote.validade, quantidade: q }] } : {}),
                observacao: 'Importação de planilha', usuario: user.email, criadoEm: ts()
              });
            }
          });
        });
        plano.atualizacoes.forEach((a) => {
          const { custo, ...campos } = resolver(a.campos);
          ops.push((b) => {
            b.update(sub('produtos').doc(a.id), { ...campos, atualizadoEm: ts() });
            if (custo !== undefined) b.set(sub('custos').doc(a.id), { custo: num(custo), atualizadoEm: ts() }, { merge: true });
          });
        });
        const total = ops.length + plano.ajustes.length;
        let feito = 0;
        await emLotes(ops, (n) => { feito += n; progresso(feito, total); });
        for (const a of plano.ajustes) {
          try { await store.addMovement({ produtoId: a.produtoId, tipo: 'ajuste', quantidade: a.quantidade, lote: { lote: 'Planilha', validade: null }, observacao: 'Importação de planilha' }, user); }
          catch (e) { if (!/igual ao estoque/.test(e.message)) throw e; }
          progresso(++feito, total);
        }
      },

      /* ---- entrada por nota fiscal (NF-e) ---- */
      async importarNFe(plano, user, progresso = () => {}) {
        const n = plano.nota;
        const notaRef = sub('notas').doc(n.chave.replace(/[^A-Za-z0-9-]/g, ''));
        const ja = await notaRef.get();
        if (ja.exists) {
          const d = toPlain(ja);
          throw erro(`Esta nota já foi lançada${d.criadoEm ? ` em ${new Date(d.criadoEm).toLocaleDateString('pt-BR')}` : ''} por ${d.lancadaPor}.`);
        }
        const obs = obsNota(n);
        const total = plano.novos.length + plano.vinculos.length + 1;
        let feito = 0;

        let fornecedorId = plano.fornecedorId;
        if (!fornecedorId) {
          const ref = await sub('fornecedores').add({
            nome: n.fornecedor.nome, cnpj: n.fornecedor.cnpj || '', telefone: n.fornecedor.telefone || '',
            contato: '', email: '', observacoes: n.fornecedor.razao && n.fornecedor.razao !== n.fornecedor.nome ? n.fornecedor.razao : '', criadoEm: ts()
          });
          fornecedorId = ref.id;
        }

        const ops = plano.novos.map((it) => (b) => {
          const ref = sub('produtos').doc();
          const { custo, ...campos } = it.campos;
          b.set(ref, { ...campos, fornecedorId, quantidade: it.quantidade, refsNFe: it.ref ? [it.ref] : [], criadoEm: ts(), atualizadoEm: ts(), criadoPor: user.email });
          if (custo !== undefined) b.set(sub('custos').doc(ref.id), { custo: num(custo), atualizadoEm: ts() });
          b.set(sub('movimentacoes').doc(), {
            produtoId: ref.id, produtoNome: it.campos.nome, sku: it.campos.sku || '', tipo: 'entrada', quantidade: it.quantidade,
            antes: 0, depois: it.quantidade, observacao: obs, usuario: user.email, criadoEm: ts()
          });
        });
        await emLotes(ops, (k) => { feito += k; progresso(feito, total); });

        for (const v of plano.vinculos) {
          const pref = sub('produtos').doc(v.produtoId);
          await db.runTransaction(async (tx) => {
            const snap = await tx.get(pref);
            if (!snap.exists) throw erro('Um dos produtos escolhidos não existe mais. Recarregue a nota.');
            const p = snap.data();
            const r = movimentar(p, { tipo: 'entrada', quantidade: v.quantidade, lote: v.lote, localPadrao });
            const c = camposMov(r, {});
            const antes = r.antes, depois = r.depois;
            const extra = { ...c.prod, atualizadoEm: ts() };
            if (v.custo !== undefined) tx.set(sub('custos').doc(v.produtoId), { custo: num(v.custo), atualizadoEm: ts() }, { merge: true });
            if (v.ref) extra.refsNFe = FV.arrayUnion(v.ref);
            if (v.ean && !p.codigoBarras) extra.codigoBarras = v.ean;
            if (!p.fornecedorId) extra.fornecedorId = fornecedorId;
            tx.update(pref, extra);
            tx.set(sub('movimentacoes').doc(), {
              produtoId: v.produtoId, produtoNome: p.nome, sku: p.sku || '', tipo: 'entrada', quantidade: num(v.quantidade),
              antes, depois, ...c.mov, observacao: obs, usuario: user.email, criadoEm: ts()
            });
          });
          progresso(++feito, total);
        }

        await notaRef.set({
          numero: n.numero, serie: n.serie, emissao: n.emissao ? firebase.firestore.Timestamp.fromMillis(n.emissao) : null,
          valor: n.valor, fornecedorId, fornecedorNome: n.fornecedor.nome, fornecedorCnpj: n.fornecedor.cnpj || '',
          itens: plano.novos.length + plano.vinculos.length, lancadaPor: user.email, criadoEm: ts()
        });
        progresso(total, total);
      }
    };
    return store;
  }

  /* ================================================================== */
  /* Modo demonstração (localStorage)                                    */
  /* ================================================================== */
  function localStore() {
    const KEY = apresentacao ? 'estokio:apresentacao:v1' : 'estokio:demo:v2';
    const user = { uid: 'demo', email: 'demo@estokio.local', name: apresentacao ? 'Você' : 'Você (demonstração)' };
    const colecoes = ['produtos', 'categorias', 'movimentacoes', 'membros', 'convites', 'empresa', 'fornecedores', 'notas', 'pedidos', 'locais', 'grades', 'solicitacoes', 'pedidosCompra', 'inventarios'];
    let localPadrao = null;
    const subs = Object.fromEntries(colecoes.map((c) => [c, new Set()]));
    const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    let memoria = null;

    function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return memoria; } }
    function persist() { memoria = data; try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* memória */ } }

    function seed() {
      const agora = Date.now();
      const categorias = [
        { id: 'c1', nome: 'Bebidas', criadoEm: agora },
        { id: 'c2', nome: 'Limpeza', criadoEm: agora },
        { id: 'c3', nome: 'Papelaria', criadoEm: agora }
      ];
      const base = [
        ['Água mineral 500 mL', 'BEB-001', 'c1', 'cx', 'Depósito, corredor 1', 9.5, 18, 10, 24],
        ['Refrigerante lata 350 mL', 'BEB-014', 'c1', 'cx', 'Depósito, corredor 1', 32, 54, 8, 5],
        ['Detergente neutro 500 mL', 'LIM-003', 'c2', 'un', 'Prateleira B2', 1.9, 3.49, 30, 42],
        ['Desinfetante 2 L', 'LIM-021', 'c2', 'un', 'Prateleira B3', 6.4, 11.9, 12, 0],
        ['Papel A4 (resma 500 fls)', 'PAP-100', 'c3', 'pct', 'Prateleira C1', 21, 32.9, 15, 18],
        ['Caneta esferográfica azul', 'PAP-205', 'c3', 'cx', 'Gaveta C4', 18, 29.9, 4, 3]
      ];
      const fornecedores = [
        { id: 'f1', nome: 'Distribuidora Litoral', cnpj: '12345678000190', contato: 'Marina', telefone: '81988887777', email: '', observacoes: '', criadoEm: agora },
        { id: 'f2', nome: 'Limpa Tudo', cnpj: '', contato: '', telefone: '', email: '', observacoes: '', criadoEm: agora }
      ];
      const forn = { c1: 'f1', c2: 'f2', c3: '' };
      const eans = ['7891234567895', '7891234567802', '7899876543210', '7899876543227', '7897777000011', '7897777000028'];
      const produtos = base.map((b, i) => ({
        id: 'p' + (i + 1), nome: b[0], sku: b[1], codigoBarras: eans[i], categoriaId: b[2], fornecedorId: forn[b[2]], unidade: b[3], localizacao: b[4],
        custo: b[5], preco: b[6], estoqueMinimo: b[7], quantidade: b[8], descricao: '',
        criadoEm: agora - 25 * DIA, atualizadoEm: agora, criadoPor: user.email
      }));
      // Histórico de 25 dias: entrada inicial + saídas diárias, para a previsão de consumo ter dados
      const movimentacoes = [];
      const ritmo = { p1: 1.4, p2: 0.5, p3: 1.2, p4: 0.6, p5: 0.3, p6: 0.25 };
      produtos.forEach((p) => {
        let saldo = p.quantidade;
        const saidas = [];
        for (let d = 1; d <= 25; d++) {
          const q = Math.round(ritmo[p.id] * (0.5 + ((d * 7 + p.id.length) % 10) / 10));
          if (q > 0) saidas.push({ d, q });
        }
        const totalSaidas = saidas.reduce((s, x) => s + x.q, 0);
        let atual = saldo + totalSaidas;
        movimentacoes.push({ id: newId(), produtoId: p.id, produtoNome: p.nome, sku: p.sku, tipo: 'entrada', quantidade: atual, antes: 0, depois: atual,
          observacao: 'Estoque inicial', usuario: user.email, criadoEm: agora - 26 * DIA });
        saidas.forEach(({ d, q }) => {
          movimentacoes.push({ id: newId(), produtoId: p.id, produtoNome: p.nome, sku: p.sku, tipo: 'saida', quantidade: q, antes: atual, depois: atual - q,
            observacao: 'Venda no balcão', usuario: user.email, criadoEm: agora - (26 - d) * DIA + 3 * 3600e3 });
          atual -= q;
        });
      });
      return {
        empresa: {
          id: 'demo', nome: 'Empresa de demonstração', cnpj: '', telefone: '', cidade: '',
          logo: null, corPrimaria: '#16233A', corDestaque: '#F2B705', acessoAte: agora + 7 * DIA,
          planoId: 'teste', planoNome: 'Teste grátis', planoPreco: 0, planoDias: 7, maxProdutos: 0, origem: 'teste',
          recursos: { ...window.EstokioAssinatura.TODOS }, pacotes: {},
          ativo: true, configurado: false, donoUid: user.uid, donoEmail: user.email,
          totalUsuarios: 1, maxUsuarios: MAX_USUARIOS, criadoEm: agora
        },
        membros: [{ id: user.uid, nome: user.name, email: user.email, papel: 'dono', entrouEm: agora }],
        convites: [], notas: [],
        produtos, categorias, movimentacoes, fornecedores
      };
    }

    let data = load();
    // Na apresentação, a loja é gerada de novo a cada dia (as datas são relativas a hoje)
    const velha = apresentacao && data && (!data.geradoEm || Date.now() - data.geradoEm > 12 * 3600e3);
    if (!data || !data.empresa || velha) {
      data = apresentacao && window.EstokioDemoDados ? window.EstokioDemoDados.gerar() : seed();
      data.geradoEm = Date.now();
      persist();
    }
    if (!data.fornecedores) data.fornecedores = [];
    if (!data.notas) data.notas = [];
    if (!data.pedidos) data.pedidos = [];
    if (!data.locais) data.locais = [];
    ['solicitacoes', 'pedidosCompra', 'inventarios'].forEach((k) => { if (!data[k]) data[k] = []; });
    if (!data.grades) data.grades = [];
    const A = window.EstokioAssinatura;

    function view(nome) {
      if (nome === 'empresa') return { ...data.empresa };
      const lista = data[nome].map((x) => ({ ...x }));
      if (nome === 'movimentacoes' || nome === 'notas') lista.sort((a, b) => b.criadoEm - a.criadoEm);
      return lista;
    }
    function emit(...nomes) { nomes.forEach((n) => { const v = view(n); subs[n].forEach((cb) => cb(v)); }); }
    function watch(nome, cb) { subs[nome].add(cb); setTimeout(() => cb(view(nome)), 0); return () => subs[nome].delete(cb); }
    const tick = () => new Promise((r) => setTimeout(r, 60));

    return {
      ...comum,
      mode: 'local',
      apresentacao,
      /** Apaga o que o visitante fez e recomeça a apresentação. */
      resetar() { try { localStorage.removeItem(KEY); } catch (e) { /* ignora */ } memoria = null; location.reload(); },
      onAuth(cb) { setTimeout(() => cb(user), 0); return () => {}; },
      login: async () => {}, register: async () => {}, resetPassword: async () => {}, logout: async () => {},

      getPerfil: async () => ({ empresaId: 'demo', papel: 'dono', email: user.email }),
      ehAdmin: async () => false,
      criarTeste: async () => { throw erro('O teste grátis precisa do Firebase configurado.'); },
      watchPlanos: (cb) => { setTimeout(() => cb(A.planosPadrao()), 0); return () => {}; },
      watchConfig: (cb) => { setTimeout(() => cb({ chavePix: 'demo@estokio.com.br', tipoChave: 'email', nomeRecebedor: 'Estokio Demonstracao', cidadeRecebedor: 'Recife', whatsappSuporte: '81999990000' }), 0); return () => {}; },
      watchPedidos: (cb) => watch('pedidos', (l) => cb(l.filter((p) => p.status === 'aguardando').sort((a, b) => b.criadoEm - a.criadoEm))),
      async criarPedido(p) {
        await tick();
        const novo = { id: newId(), ...p, empresaId: 'demo', status: 'aguardando', criadoPor: user.email, criadoEm: Date.now() };
        data.pedidos.push(novo); persist(); emit('pedidos');
        return novo;
      },
      async cancelarPedido(id) {
        await tick();
        const p = data.pedidos.find((x) => x.id === id); if (p) p.status = 'cancelado';
        persist(); emit('pedidos');
      },
      setEmpresa() {},
      async consultarCodigo(codigo) {
        // Na demonstração, qualquer código REN no formato certo vale +30 dias, para testar a tela.
        const id = normalizarCodigo(codigo);
        if (/^REN-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(id)) {
          if ((data.usados || []).includes(id)) throw erro('Este código já foi usado.');
          return { id, tipo: 'renovacao', dias: 30, empresaId: 'demo', empresaNome: data.empresa.nome, status: 'pendente' };
        }
        throw erro('Na demonstração só códigos de renovação (REN-XXXX-XXXX-XXXX) funcionam. Os demais precisam do Firebase.');
      },
      resgatarCodigo: async () => { throw erro('Códigos só funcionam com o Firebase configurado.'); },

      watchEmpresa: (cb) => watch('empresa', cb),
      watchMembro: (uid, cb) => { setTimeout(() => cb(data.membros.find((m) => m.id === uid) || null), 0); return () => {}; },
      async saveEmpresa(campos) { await tick(); Object.assign(data.empresa, campos, { atualizadoEm: Date.now() }); persist(); emit('empresa'); },
      async registrarAcesso() { data.empresa.ultimoAcesso = Date.now(); persist(); },
      async exportarDados() {
        const { empresa, membros, produtos, categorias, fornecedores, movimentacoes, notas } = data;
        return { exportadoEm: new Date().toISOString(), empresa, membros, produtos, categorias, fornecedores, movimentacoes, notas };
      },
      async renovarAcesso(c) {
        await tick();
        const novo = novoVencimento(data.empresa.acessoAte, c.dias);
        data.empresa.acessoAte = novo; data.empresa.ultimaRenovacao = c.id;
        data.usados = (data.usados || []).concat(c.id);
        persist(); emit('empresa');
        return novo;
      },

      watchConvitesEquipe: (cb) => watch('convites', cb),
      async criarConviteEquipe(u, empresaNome, dias = 7, papel = 'estoquista') {
        await tick();
        const id = gerarCodigo('EQP');
        data.convites.push({ id, tipo: 'membro', papel, empresaId: 'demo', empresaNome, status: 'pendente', criadoPor: u.uid, criadoEm: Date.now(), validoAte: Date.now() + dias * 864e5 });
        persist(); emit('convites');
        return id;
      },
      async cancelarConvite(id) { await tick(); data.convites = data.convites.filter((c) => c.id !== id); persist(); emit('convites'); },
      async removerMembro(uid) {
        await tick();
        data.membros = data.membros.filter((m) => m.id !== uid);
        data.empresa.totalUsuarios = data.membros.length;
        persist(); emit('membros', 'empresa');
      },

      subscribe: (nome, cb) => watch(nome, cb),

      async saveProduct(p) {
        await tick();
        const { id, quantidadeInicial, _obsInicial, _movExtra, ...campos } = p;
        const agora = Date.now();
        if (id) {
          const alvo = data.produtos.find((x) => x.id === id);
          if (!alvo) throw erro('Produto não encontrado.');
          Object.assign(alvo, campos, { atualizadoEm: agora });
        } else {
          const qtd = num(quantidadeInicial);
          const novo = { id: newId(), ...campos, quantidade: qtd, criadoEm: agora, atualizadoEm: agora, criadoPor: user.email };
          data.produtos.push(novo);
          if (qtd > 0) {
            data.movimentacoes.push({
              id: newId(), produtoId: novo.id, produtoNome: novo.nome, sku: novo.sku || '', tipo: 'entrada',
              quantidade: qtd, antes: 0, depois: qtd, ...(_movExtra || {}), observacao: _obsInicial || 'Estoque inicial', usuario: user.email, criadoEm: agora
            });
          }
        }
        persist(); emit('produtos', 'movimentacoes');
      },
      async deleteProduct(id) { await tick(); data.produtos = data.produtos.filter((p) => p.id !== id); persist(); emit('produtos'); },
      configurarCustos() { /* na demonstração o custo fica no próprio produto */ },
      async sondarRegras() { return 'ok'; },
      async mudarPapel(uid, papel) { await tick(); const m = data.membros.find((x) => x.id === uid); if (m) m.papel = papel; persist(); emit('membros'); },
      async solicitarAjuste(s) { await tick(); data.solicitacoes.push({ id: newId(), ...s, status: 'pendente', solicitadoPor: user.email, criadoEm: Date.now() }); persist(); emit('solicitacoes'); },
      async resolverSolicitacao(s, aprovar) {
        if (aprovar) await this.addMovement({ produtoId: s.produtoId, tipo: 'ajuste', quantidade: s.quantidade, localId: s.localId || undefined, localNome: s.localNome || '',
          lote: s.lote || undefined, observacao: `${s.observacao ? `${s.observacao}. ` : ''}Pedido por ${s.solicitadoPor}` });
        const x = data.solicitacoes.find((y) => y.id === s.id); if (x) x.status = aprovar ? 'aprovado' : 'recusado';
        persist(); emit('solicitacoes');
      },
      async venderKit(k) {
        await tick();
        const kit = data.produtos.find((x) => x.id === k.kitId);
        if (!kit) throw erro('Kit não encontrado.');
        const plano = planoKit(kit, k.quantidade);
        const res = plano.map((i) => {
          const p = data.produtos.find((x) => x.id === i.produtoId);
          if (!p) throw erro('Um item deste kit não existe mais. Edite o kit.');
          return calcularItemKit(p, i, k, localPadrao);
        });
        res.forEach(({ p, r }, i) => {
          const c = camposMov(r, k);
          Object.assign(p, c.prod, { atualizadoEm: Date.now() });
          data.movimentacoes.push({ id: newId(), produtoId: p.id, produtoNome: p.nome, sku: p.sku || '', tipo: 'saida', quantidade: plano[i].total,
            antes: r.antes, depois: r.depois, ...c.mov, kitId: k.kitId, kitNome: kit.nome, kitQtd: num(k.quantidade), observacao: obsKit(kit, k), usuario: user.email, criadoEm: Date.now() });
        });
        persist(); emit('produtos', 'movimentacoes');
      },
      async salvarPedidoCompra(p) {
        await tick();
        const { id, ...campos } = p;
        if (id) Object.assign(data.pedidosCompra.find((x) => x.id === id) || {}, campos, { atualizadoEm: Date.now() });
        else data.pedidosCompra.push({ id: newId(), ...campos, criadoPor: user.email, criadoEm: Date.now(), atualizadoEm: Date.now() });
        persist(); emit('pedidosCompra');
      },
      async receberPedido(r) {
        await tick();
        const ped = data.pedidosCompra.find((x) => x.id === r.pedidoId);
        if (!ped) throw erro('Pedido não encontrado.');
        if (['recebido', 'cancelado'].includes(ped.status)) throw erro('Este pedido já foi encerrado.');
        const alvos = r.itens.filter((x) => num(x.qtd) > 0);
        if (!alvos.length) throw erro('Informe a quantidade recebida de pelo menos um item.');
        const calc = alvos.map((a) => {
          const it = ped.itens[a.idx];
          const p = data.produtos.find((x) => x.id === it.produtoId);
          if (!p) throw erro(`O produto ${it.nome} não existe mais.`);
          return { a, it, p, rr: movimentar(p, { tipo: 'entrada', quantidade: a.qtd, lote: a.lote, localId: r.localId, localPadrao: r.localPadrao || localPadrao }) };
        });
        calc.forEach(({ a, it, p, rr }) => {
          const c = camposMov(rr, r);
          Object.assign(p, c.prod, { atualizadoEm: Date.now() });
          if (r.atualizarCusto && num(it.custo) > 0) p.custo = num(it.custo);
          data.movimentacoes.push({ id: newId(), produtoId: p.id, produtoNome: p.nome, sku: p.sku || '', tipo: 'entrada', quantidade: num(a.qtd), antes: rr.antes, depois: rr.depois, ...c.mov,
            pedidoId: ped.id, observacao: `Pedido ${ped.numero}, ${ped.fornecedorNome}`, usuario: user.email, criadoEm: Date.now() });
          it.recebido = round3(num(it.recebido) + num(a.qtd));
        });
        ped.status = ped.itens.every((i) => num(i.recebido) >= num(i.qtd)) ? 'recebido' : 'parcial';
        ped.recebidoEm = Date.now(); ped.recebidoPor = user.email;
        ped.diasEntrega = r.diasEntrega !== undefined && r.diasEntrega !== null && r.diasEntrega !== '' ? Math.max(0, Math.round(num(r.diasEntrega))) : Math.max(0, Math.round((Date.now() - num(ped.criadoEm)) / DIA));
        persist(); emit('produtos', 'movimentacoes', 'pedidosCompra');
      },
      async salvarInventario(inv) {
        await tick();
        const { id, ...campos } = inv;
        let nid = id;
        if (id) Object.assign(data.inventarios.find((x) => x.id === id) || {}, campos, { atualizadoEm: Date.now() });
        else { nid = newId(); data.inventarios.push({ id: nid, ...campos, contagens: {}, status: 'aberto', criadoPor: user.email, criadoEm: Date.now(), atualizadoEm: Date.now() }); }
        persist(); emit('inventarios');
        return nid;
      },
      async contarItem(invId, produtoId, qtd) {
        await tick();
        const inv = data.inventarios.find((x) => x.id === invId);
        if (!inv) throw erro('Inventário não encontrado.');
        inv.contagens = inv.contagens || {};
        if (qtd === null) delete inv.contagens[produtoId]; else inv.contagens[produtoId] = { qtd: num(qtd), por: user.email, em: Date.now() };
        persist(); emit('inventarios');
      },
      setLocalPadrao(id) { localPadrao = id || null; },
      async addMovement(m) {
        await tick();
        const p = data.produtos.find((x) => x.id === m.produtoId);
        if (!p) throw erro('Produto não encontrado.');
        const r = movimentar(p, { ...m, localPadrao: m.localPadrao || localPadrao });
        const c = camposMov(r, m);
        Object.assign(p, c.prod, { atualizadoEm: Date.now() });
        data.movimentacoes.push({
          id: newId(), produtoId: p.id, produtoNome: p.nome, sku: p.sku || '', tipo: m.tipo,
          quantidade: num(m.quantidade), antes: r.antes, depois: r.depois, ...c.mov, observacao: m.observacao || '', usuario: user.email, criadoEm: Date.now()
        });
        persist(); emit('produtos', 'movimentacoes');
      },
      async transferir(t) {
        await tick();
        const p = data.produtos.find((x) => x.id === t.produtoId);
        if (!p) throw erro('Produto não encontrado.');
        p.estoques = transferencia(p, { ...t, localPadrao: t.localPadrao || localPadrao });
        data.movimentacoes.push({
          id: newId(), produtoId: p.id, produtoNome: p.nome, sku: p.sku || '', tipo: 'transferencia', quantidade: num(t.quantidade),
          antes: num(p.quantidade), depois: num(p.quantidade), de: t.de, deNome: t.deNome || '', para: t.para, paraNome: t.paraNome || '',
          observacao: t.observacao || '', usuario: user.email, criadoEm: Date.now()
        });
        persist(); emit('produtos', 'movimentacoes');
      },
      async saveLocal(l) {
        await tick();
        const { id, ...campos } = l;
        let nid = id;
        if (id) Object.assign(data.locais.find((x) => x.id === id) || {}, campos);
        else { nid = newId(); data.locais.push({ id: nid, ...campos, criadoEm: Date.now() }); }
        persist(); emit('locais');
        return nid;
      },
      async deleteLocal(id) { await tick(); data.locais = data.locais.filter((l) => l.id !== id); persist(); emit('locais'); },
      async salvarGrade(g, novas, atualizarIds) {
        await tick();
        const { id, ...campos } = g;
        const gid = id || newId();
        if (id) Object.assign(data.grades.find((x) => x.id === id) || {}, campos);
        else data.grades.push({ id: gid, ...campos, criadoEm: Date.now() });
        const comum = { categoriaId: campos.categoriaId || '', fornecedorId: campos.fornecedorId || '', unidade: campos.unidade || 'un',
          custo: num(campos.custo), preco: num(campos.preco), estoqueMinimo: num(campos.estoqueMinimo) };
        novas.forEach((v) => data.produtos.push({ id: newId(), ...comum, nome: v.nome, sku: v.sku || '', codigoBarras: '', localizacao: '', descricao: '',
          gradeId: gid, variacao: v.variacao, quantidade: 0, criadoEm: Date.now(), atualizadoEm: Date.now(), criadoPor: user.email }));
        (atualizarIds || []).forEach((pid) => { const p = data.produtos.find((x) => x.id === pid); if (p) Object.assign(p, comum); });
        persist(); emit('grades', 'produtos');
        return gid;
      },
      async deleteGrade(id) { await tick(); data.grades = data.grades.filter((g) => g.id !== id); persist(); emit('grades'); },
      async movimentacoesDesde(ms) { return data.movimentacoes.filter((m) => m.criadoEm >= ms).sort((a, b) => b.criadoEm - a.criadoEm); },
      async saveCategory(c) {
        await tick();
        if (c.id) { const a = data.categorias.find((x) => x.id === c.id); if (a) a.nome = c.nome; }
        else data.categorias.push({ id: newId(), nome: c.nome, criadoEm: Date.now() });
        persist(); emit('categorias');
      },
      async deleteCategory(id) { await tick(); data.categorias = data.categorias.filter((c) => c.id !== id); persist(); emit('categorias'); },

      async saveFornecedor(f) {
        await tick();
        const { id, ...campos } = f;
        let novoId = id;
        if (id) Object.assign(data.fornecedores.find((x) => x.id === id) || {}, campos);
        else { novoId = newId(); data.fornecedores.push({ id: novoId, ...campos, criadoEm: Date.now() }); }
        persist(); emit('fornecedores');
        return novoId;
      },
      async deleteFornecedor(id) { await tick(); data.fornecedores = data.fornecedores.filter((f) => f.id !== id); persist(); emit('fornecedores'); },

      async importarProdutos(plano, u, progresso = () => {}) {
        const agora = Date.now();
        const catIds = {}, fornIds = {};
        plano.categoriasNovas.forEach((nome) => { const id = newId(); catIds[nrm(nome)] = id; data.categorias.push({ id, nome, criadoEm: agora }); });
        plano.fornecedoresNovos.forEach((nome) => { const id = newId(); fornIds[nrm(nome)] = id; data.fornecedores.push({ id, nome, cnpj: '', contato: '', telefone: '', email: '', observacoes: '', criadoEm: agora }); });
        const resolver = ({ _categoriaNome, _fornecedorNome, ...c }) => {
          if (_categoriaNome) c.categoriaId = catIds[nrm(_categoriaNome)] || '';
          if (_fornecedorNome) c.fornecedorId = fornIds[nrm(_fornecedorNome)] || '';
          return c;
        };
        plano.novos.forEach((n) => {
          const campos = resolver(n.campos);
          const q = num(n.quantidadeInicial);
          const lotes = n.lote && q > 0 ? [{ id: novoIdLote(), lote: n.lote.lote, validade: n.lote.validade, quantidade: q }] : undefined;
          const novo = { id: newId(), ...campos, quantidade: q, ...(lotes ? { lotes } : {}), criadoEm: agora, atualizadoEm: agora, criadoPor: user.email };
          data.produtos.push(novo);
          if (q > 0) data.movimentacoes.push({ id: newId(), produtoId: novo.id, produtoNome: novo.nome, sku: novo.sku || '', tipo: 'entrada', quantidade: q, antes: 0, depois: q, ...(n.lote ? { lotes: [{ lote: n.lote.lote, validade: n.lote.validade, quantidade: q }] } : {}), observacao: 'Importação de planilha', usuario: user.email, criadoEm: agora });
        });
        plano.atualizacoes.forEach((a) => { const p = data.produtos.find((x) => x.id === a.id); if (p) Object.assign(p, resolver(a.campos), { atualizadoEm: agora }); });
        persist(); emit('produtos', 'movimentacoes', 'categorias', 'fornecedores');
        for (const a of plano.ajustes) {
          try { await this.addMovement({ produtoId: a.produtoId, tipo: 'ajuste', quantidade: a.quantidade, lote: { lote: 'Planilha', validade: null }, observacao: 'Importação de planilha' }); }
          catch (e) { if (!/igual ao estoque/.test(e.message)) throw e; }
        }
        progresso(1, 1);
      },

      async importarNFe(plano, u, progresso = () => {}) {
        await tick();
        const n = plano.nota;
        const ja = data.notas.find((x) => x.id === n.chave);
        if (ja) throw erro(`Esta nota já foi lançada em ${new Date(ja.criadoEm).toLocaleDateString('pt-BR')} por ${ja.lancadaPor}.`);
        const agora = Date.now();
        const obs = obsNota(n);
        let fornecedorId = plano.fornecedorId;
        if (!fornecedorId) {
          fornecedorId = newId();
          data.fornecedores.push({ id: fornecedorId, nome: n.fornecedor.nome, cnpj: n.fornecedor.cnpj || '', telefone: n.fornecedor.telefone || '', contato: '', email: '', observacoes: '', criadoEm: agora });
        }
        plano.novos.forEach((it) => {
          const p = { id: newId(), ...it.campos, fornecedorId, quantidade: it.quantidade, refsNFe: it.ref ? [it.ref] : [], criadoEm: agora, atualizadoEm: agora, criadoPor: user.email };
          data.produtos.push(p);
          data.movimentacoes.push({ id: newId(), produtoId: p.id, produtoNome: p.nome, sku: p.sku || '', tipo: 'entrada', quantidade: it.quantidade, antes: 0, depois: it.quantidade, observacao: obs, usuario: user.email, criadoEm: agora });
        });
        plano.vinculos.forEach((v) => {
          const p = data.produtos.find((x) => x.id === v.produtoId);
          if (!p) return;
          const r = movimentar(p, { tipo: 'entrada', quantidade: v.quantidade, lote: v.lote, localPadrao });
          const c = camposMov(r, {});
          const antes = r.antes;
          Object.assign(p, c.prod);
          if (v.custo !== undefined) p.custo = v.custo;
          if (v.ref) p.refsNFe = Array.from(new Set([...(p.refsNFe || []), v.ref]));
          if (v.ean && !p.codigoBarras) p.codigoBarras = v.ean;
          if (!p.fornecedorId) p.fornecedorId = fornecedorId;
          data.movimentacoes.push({ id: newId(), produtoId: p.id, produtoNome: p.nome, sku: p.sku || '', tipo: 'entrada', quantidade: num(v.quantidade), antes, depois: p.quantidade, ...c.mov, observacao: obs, usuario: user.email, criadoEm: agora });
        });
        data.notas.push({ id: n.chave, numero: n.numero, serie: n.serie, emissao: n.emissao, valor: n.valor, fornecedorId, fornecedorNome: n.fornecedor.nome, fornecedorCnpj: n.fornecedor.cnpj || '', itens: plano.novos.length + plano.vinculos.length, lancadaPor: user.email, criadoEm: agora });
        persist(); emit('produtos', 'movimentacoes', 'fornecedores', 'notas');
        progresso(1, 1);
      }
    };
  }

  window.EstokioDB = useFirebase ? firebaseStore() : localStore();
  window.EstokioDB.__teste = { movimentar, transferencia, lotesDe, estoquesDe, planoKit, calcularItemKit };
})();
