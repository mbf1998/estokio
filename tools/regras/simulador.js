/*
 * Estokio — simulador das regras do Firestore.
 *
 * Lê o arquivo firestore.rules e avalia as condições de leitura e gravação com a mesma lógica da linguagem
 * de regras (funções, let, &&/|| com tratamento de erro, get/exists/getAfter, diff, hasOnly, matches, duration).
 * Serve para testar quem pode o quê SEM um Firebase de verdade, e para CONTAR as consultas a outros documentos
 * (get/exists) de cada gravação: o Firestore aceita no máximo 20 por lote ou transação e 10 por gravação.
 *
 * Limites desta ferramenta: não é o emulador oficial. Cobre o que as regras do Estokio usam; se uma regra nova usar
 * algo que o simulador não conhece, ele avisa em vez de fingir que entendeu. Confirme sempre no emulador oficial.
 */
'use strict';

class ErroRegra extends Error {}
class Ts { constructor(ms) { this.ms = ms; } valueOf() { return this.ms; } }
class Dur { constructor(ms) { this.ms = ms; } valueOf() { return this.ms; } }
class Conjunto { constructor(it) { this.s = new Set(it); } }
class Dif { constructor(a, b) { this.a = a; this.b = b; } }
const ehMapa = (v) => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Ts) && !(v instanceof Dur) && !(v instanceof Conjunto) && !(v instanceof Dif);

/* ---------------- analisador léxico ---------------- */
function tokenizar(src) {
  const t = []; let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 2; continue; }
    if (c === '/' && /[A-Za-z{$]/.test(src[i + 1] || '')) {          // caminho
      let j = i, prof = 0;
      while (j < n) {
        const d = src[j];
        if (d === '$' && src[j + 1] === '(') { prof++; j += 2; continue; }
        if (prof > 0) { if (d === '(') prof++; else if (d === ')') prof--; j++; continue; }
        if (/\s/.test(d) || d === ',' || d === ';' || d === ')') break;
        j++;
      }
      t.push({ k: 'path', v: src.slice(i, j) }); i = j; continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1, s = '';
      while (j < n && src[j] !== c) { if (src[j] === '\\') { s += src[j + 1]; j += 2; } else s += src[j++]; }
      t.push({ k: 'str', v: s }); i = j + 1; continue;
    }
    if (/[0-9]/.test(c)) { let j = i; while (j < n && /[0-9.]/.test(src[j])) j++; t.push({ k: 'num', v: parseFloat(src.slice(i, j)) }); i = j; continue; }
    if (/[A-Za-z_]/.test(c)) { let j = i; while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++; t.push({ k: 'id', v: src.slice(i, j) }); i = j; continue; }
    const dois = src.slice(i, i + 2);
    if (['&&', '||', '==', '!=', '<=', '>='].includes(dois)) { t.push({ k: 'op', v: dois }); i += 2; continue; }
    if ('!+-*%<>?:.,;()[]{}='.includes(c)) { t.push({ k: 'op', v: c }); i++; continue; }
    throw new Error(`Caractere inesperado "${c}" perto de: ${src.slice(Math.max(0, i - 30), i + 30).replace(/\n/g, ' ')}`);
  }
  return t;
}

/* ---------------- analisador sintático ---------------- */
function analisar(src) {
  const t = tokenizar(src); let p = 0;
  const ve = () => t[p], pega = () => t[p++];
  const eh = (v) => t[p] && t[p].v === v && t[p].k !== 'str';
  const espera = (v) => { if (!eh(v)) throw new Error(`Esperava "${v}" mas veio "${t[p] ? t[p].v : 'fim'}" (token ${p})`); return pega(); };

  function caminhoSeg(raw) {          // "/a/$(x)/b" -> [ 'a', {expr}, 'b' ]
    const segs = []; let i = raw[0] === '/' ? 1 : 0, atual = '';
    const empurra = () => { if (atual !== '') segs.push(atual); atual = ''; };
    while (i < raw.length) {
      if (raw[i] === '$' && raw[i + 1] === '(') {
        let prof = 1, j = i + 2; while (j < raw.length && prof > 0) { if (raw[j] === '(') prof++; else if (raw[j] === ')') prof--; j++; }
        const sub = analisarExpressao(raw.slice(i + 2, j - 1)); empurra(); segs.push(sub); i = j; continue;
      }
      if (raw[i] === '/') { empurra(); i++; continue; }
      atual += raw[i++];
    }
    empurra(); return segs;
  }
  function analisarExpressao(texto) { const sub = analisar.expr(texto); return sub; }

  function expr() { return cond(); }
  function cond() { const c = ou(); if (eh('?')) { pega(); const a = expr(); espera(':'); const b = expr(); return { t: 'cond', c, a, b }; } return c; }
  function ou() { let l = e(); while (eh('||')) { pega(); l = { t: 'or', l, r: e() }; } return l; }
  function e() { let l = igual(); while (eh('&&')) { pega(); l = { t: 'and', l, r: igual() }; } return l; }
  function igual() { let l = rel(); while (eh('==') || eh('!=')) { const o = pega().v; l = { t: 'bin', o, l, r: rel() }; } return l; }
  function rel() {
    let l = soma();
    for (;;) {
      if (['<', '<=', '>', '>='].some(eh)) { const o = pega().v; l = { t: 'bin', o, l, r: soma() }; }
      else if (ve() && ve().k === 'id' && ve().v === 'in') { pega(); l = { t: 'in', l, r: soma() }; }
      else if (ve() && ve().k === 'id' && ve().v === 'is') { pega(); l = { t: 'is', l, tipo: pega().v }; }
      else break;
    }
    return l;
  }
  function soma() { let l = mult(); while (eh('+') || eh('-')) { const o = pega().v; l = { t: 'bin', o, l, r: mult() }; } return l; }
  function mult() { let l = un(); while (eh('*') || eh('%')) { const o = pega().v; l = { t: 'bin', o, l, r: un() }; } return l; }
  function un() { if (eh('!')) { pega(); return { t: 'not', x: un() }; } if (eh('-')) { pega(); return { t: 'neg', x: un() }; } return post(); }
  function post() {
    let x = prim();
    for (;;) {
      if (eh('.')) { pega(); x = { t: 'mem', o: x, n: pega().v }; }
      else if (eh('(') && (x.t === 'id' || x.t === 'mem')) { pega(); const a = []; if (!eh(')')) { do { a.push(expr()); } while (eh(',') && pega()); } espera(')'); x = { t: 'call', f: x, a }; }
      else if (eh('[')) { pega(); const i = expr(); espera(']'); x = { t: 'idx', o: x, i }; }
      else break;
    }
    return x;
  }
  function prim() {
    const k = pega();
    if (k.k === 'num') return { t: 'lit', v: k.v };
    if (k.k === 'str') return { t: 'lit', v: k.v };
    if (k.k === 'path') return { t: 'path', segs: caminhoSeg(k.v) };
    if (k.k === 'id') {
      if (k.v === 'true') return { t: 'lit', v: true };
      if (k.v === 'false') return { t: 'lit', v: false };
      if (k.v === 'null') return { t: 'lit', v: null };
      return { t: 'id', n: k.v };
    }
    if (k.v === '(') { const x = expr(); espera(')'); return x; }
    if (k.v === '[') { const l = []; if (!eh(']')) { do { l.push(expr()); } while (eh(',') && pega()); } espera(']'); return { t: 'list', l }; }
    if (k.v === '{') { const m = []; if (!eh('}')) { do { const ch = pega(); espera(':'); m.push([ch.v, expr()]); } while (eh(',') && pega()); } espera('}'); return { t: 'map', m }; }
    throw new Error(`Expressão inesperada: "${k.v}" (token ${p - 1})`);
  }
  analisar.expr = (texto) => { const sub = analisar.__criar(texto); return sub; };

  function funcao() {
    espera('function'); const nome = pega().v; espera('(');
    const ps = []; if (!eh(')')) { do { ps.push(pega().v); } while (eh(',') && pega()); } espera(')'); espera('{');
    const corpo = [];
    while (!eh('}')) {
      if (eh('let')) { pega(); const n = pega().v; espera('='); corpo.push({ let: n, x: expr() }); espera(';'); }
      else if (eh('return')) { pega(); corpo.push({ ret: expr() }); espera(';'); }
      else throw new Error(`Instrução inesperada na função ${nome}: "${ve().v}"`);
    }
    espera('}'); return { nome, ps, corpo };
  }
  function bloco(caminho) {
    const m = { caminho, fns: {}, regras: [], filhos: [] };
    while (!eh('}')) {
      if (eh('function')) { const f = funcao(); m.fns[f.nome] = f; }
      else if (eh('match')) { pega(); const pth = pega().v; espera('{'); m.filhos.push(bloco(pth)); espera('}'); }
      else if (eh('allow')) {
        pega(); const metodos = []; do { metodos.push(pega().v); } while (eh(',') && pega());
        espera(':'); espera('if'); const c = expr(); espera(';'); m.regras.push({ metodos, c });
      } else throw new Error(`Item inesperado: "${ve().v}" (token ${p})`);
    }
    return m;
  }
  // arquivo
  espera('rules_version'); espera('='); pega(); espera(';');
  espera('service'); pega(); espera('.'); pega(); espera('{');
  const raiz = []; while (!eh('}')) { espera('match'); const pth = pega().v; espera('{'); raiz.push(bloco(pth)); espera('}'); }
  return raiz[0];
}
// expressões soltas (interpolações $(...) dos caminhos)
analisar.__criar = (texto) => { const tk = tokenizar(texto); const fake = `rules_version = '2'; service cloud.firestore { match /x { allow read: if ${texto}; } }`; return analisar(fake).regras[0].c; };

/* ---------------- avaliador ---------------- */
function criarSimulador(texto) {
  const raiz = analisar(texto);

  function avaliar(op) {
    const ctx = { consultas: 0, unicas: new Set(), erros: [] };
    const antes = op.antes || new Map();
    const depois = op.depois || aplicar(antes, op);
    const docPath = op.caminho.replace(/^\/+/, '');
    const segsDoc = docPath.split('/');
    const existente = antes.get(docPath);
    const req = { auth: op.auth ? { uid: op.auth.uid, token: { email: op.auth.email } } : null, time: op.agora || new Ts(Date.now()), resource: op.dados !== undefined ? { data: op.dados } : null, method: op.metodo };
    const res = existente !== undefined ? { data: existente, id: segsDoc[segsDoc.length - 1] } : null;

    const acesso = (p, db) => { const k = p.join('/'); ctx.consultas++; ctx.unicas.add(k); return db.get(k); };
    const normalizaPath = (v) => { if (!(v && v.path)) throw new ErroRegra('caminho inválido'); return v.path.replace(/^databases\/\(default\)\/documents\//, ''); };

    function chamar(escopo, fn, args) {
      const local = Object.assign(Object.create(null), escopo.vars);
      fn.ps.forEach((n, i) => { local[n] = args[i]; });
      const esc = { vars: local, fns: escopo.fns };
      for (const s of fn.corpo) {
        if (s.let) local[s.let] = ev(s.x, esc);
        else return ev(s.ret, esc);
      }
      throw new ErroRegra('função sem retorno');
    }

    function ev(n, esc) {
      switch (n.t) {
        case 'lit': return n.v;
        case 'list': return n.l.map((x) => ev(x, esc));
        case 'map': return Object.fromEntries(n.m.map(([k, v]) => [k, ev(v, esc)]));
        case 'path': return { path: n.segs.map((s) => (typeof s === 'string' ? s : String(ev(s, esc)))).join('/') };
        case 'id': {
          if (n.n in esc.vars) return esc.vars[n.n];
          if (n.n === 'request') return req;
          if (n.n === 'resource') { if (!res) throw new ErroRegra('resource inexistente'); return res; }
          if (n.n === 'duration') return { __duration: true };
          throw new ErroRegra(`nome desconhecido: ${n.n}`);
        }
        case 'mem': {
          const o = ev(n.o, esc);
          if (o === null || o === undefined) throw new ErroRegra(`acesso a "${n.n}" de valor nulo`);
          if (o instanceof Ts && n.n === 'ms') return o.ms;
          if (ehMapa(o)) { if (!(n.n in o)) throw new ErroRegra(`campo ausente: ${n.n}`); return o[n.n]; }
          throw new ErroRegra(`não sei ler ".${n.n}"`);
        }
        case 'idx': { const o = ev(n.o, esc), i = ev(n.i, esc); if (!(i in o)) throw new ErroRegra('índice ausente'); return o[i]; }
        case 'not': return !ev(n.x, esc);
        case 'neg': return -ev(n.x, esc);
        case 'cond': return ev(n.c, esc) ? ev(n.a, esc) : ev(n.b, esc);
        case 'and': return logico(n, esc, false);
        case 'or': return logico(n, esc, true);
        case 'in': {
          const l = ev(n.l, esc), r = ev(n.r, esc);
          if (Array.isArray(r)) return r.some((x) => x === l);
          if (r instanceof Conjunto) return r.s.has(l);
          if (ehMapa(r)) return l in r;
          throw new ErroRegra('"in" em tipo desconhecido');
        }
        case 'is': {
          const v = ev(n.l, esc);
          const tipos = { string: typeof v === 'string', number: typeof v === 'number', int: Number.isInteger(v), float: typeof v === 'number', bool: typeof v === 'boolean', list: Array.isArray(v), map: ehMapa(v), timestamp: v instanceof Ts, duration: v instanceof Dur };
          if (!(n.tipo in tipos)) throw new ErroRegra(`tipo desconhecido em "is": ${n.tipo}`);
          return tipos[n.tipo];
        }
        case 'bin': return binario(n.o, ev(n.l, esc), ev(n.r, esc));
        case 'call': return chamada(n, esc);
        default: throw new ErroRegra(`nó desconhecido: ${n.t}`);
      }
    }
    // && e || com a semântica de erros da linguagem: um lado decide o resultado mesmo que o outro dê erro
    function logico(n, esc, ehOu) {
      let l, el = null, r, er = null;
      try { l = ev(n.l, esc); } catch (x) { if (!(x instanceof ErroRegra)) throw x; el = x; }
      if (el === null && l === ehOu) return ehOu;
      try { r = ev(n.r, esc); } catch (x) { if (!(x instanceof ErroRegra)) throw x; er = x; }
      if (er === null && r === ehOu) return ehOu;
      if (el) throw el; if (er) throw er;
      return ehOu ? (l || r) : (l && r);
    }
    function binario(o, a, b) {
      const num = (x) => (x instanceof Ts || x instanceof Dur ? x.ms : x);
      if (o === '==') return a instanceof Ts || b instanceof Ts ? num(a) === num(b) : (Array.isArray(a) ? JSON.stringify(a) === JSON.stringify(b) : a === b);
      if (o === '!=') return !binario('==', a, b);
      if (o === '+') {
        if (a instanceof Ts && b instanceof Dur) return new Ts(a.ms + b.ms);
        if (a instanceof Dur && b instanceof Dur) return new Dur(a.ms + b.ms);
        if (Array.isArray(a)) return a.concat(b);
        return a + b;
      }
      if (o === '-') return a instanceof Ts && b instanceof Dur ? new Ts(a.ms - b.ms) : num(a) - num(b);
      if (['<', '<=', '>', '>='].includes(o)) {
        if (a === null || b === null || a === undefined || b === undefined) throw new ErroRegra('comparação com nulo');
        const x = num(a), y = num(b);
        if (typeof x !== typeof y) throw new ErroRegra('comparação entre tipos diferentes');
        return o === '<' ? x < y : o === '<=' ? x <= y : o === '>' ? x > y : x >= y;
      }
      if (o === '*') return num(a) * num(b);
      if (o === '%') return num(a) % num(b);
      throw new ErroRegra(`operador desconhecido ${o}`);
    }
    function chamada(n, esc) {
      const args = () => n.a.map((x) => ev(x, esc));
      if (n.f.t === 'id') {
        const nome = n.f.n;
        if (esc.fns[nome]) return chamar(esc, esc.fns[nome], args());
        if (['get', 'getAfter'].includes(nome)) {
          const [pth] = args(); const d = acesso(normalizaPath(pth).split('/'), nome === 'get' ? antes : depois);
          if (d === undefined) throw new ErroRegra(`documento inexistente: ${normalizaPath(pth)}`);
          return { data: d };
        }
        if (['exists', 'existsAfter'].includes(nome)) { const [pth] = args(); return acesso(normalizaPath(pth).split('/'), nome === 'exists' ? antes : depois) !== undefined; }
        throw new ErroRegra(`função desconhecida: ${nome}`);
      }
      // método: o.nome(args)
      const nome = n.f.n;
      if (n.f.o.t === 'id' && n.f.o.n === 'duration' && nome === 'value') {
        const [q, u] = args(); const mult = { d: 864e5, h: 36e5, m: 6e4, s: 1e3, ms: 1 }[u]; if (!mult) throw new ErroRegra(`unidade de duração: ${u}`); return new Dur(q * mult);
      }
      const o = ev(n.f.o, esc); const a = args();
      if (nome === 'get' && ehMapa(o)) return (a[0] in o) ? o[a[0]] : a[1];
      if (nome === 'size') return typeof o === 'string' || Array.isArray(o) ? o.length : o instanceof Conjunto ? o.s.size : Object.keys(o).length;
      if (nome === 'keys') return new Conjunto(Object.keys(o));
      if (nome === 'diff') return new Dif(o, a[0]);
      if (nome === 'affectedKeys' && o instanceof Dif) {
        const ks = new Set([...Object.keys(o.a || {}), ...Object.keys(o.b || {})]);
        return new Conjunto([...ks].filter((k) => JSON.stringify(o.a[k]) !== JSON.stringify(o.b[k]) || !(k in o.a) || !(k in o.b)));
      }
      const itens = o instanceof Conjunto ? [...o.s] : o;
      if (nome === 'hasOnly') return itens.every((x) => a[0].includes(x));
      if (nome === 'hasAny') return itens.some((x) => a[0].includes(x));
      if (nome === 'hasAll') return a[0].every((x) => itens.includes(x));
      if (nome === 'matches') { if (typeof o !== 'string') throw new ErroRegra('matches em não-texto'); return new RegExp(`^(?:${a[0]})$`).test(o); }
      throw new ErroRegra(`método desconhecido: .${nome}()`);
    }

    // procura os "match" que cobrem o documento e coleta as regras que valem para o método
    const categoria = { get: ['read', 'get'], list: ['read', 'list'], create: ['write', 'create'], update: ['write', 'update'], delete: ['write', 'delete'] }[op.metodo];
    const concedidos = []; const erros = [];
    function percorrer(m, restante, vars, fns, ehRaiz) {
      const segsPadrao = m.caminho.replace(/^\/+/, '').split('/').filter(Boolean);
      const novasVars = Object.assign(Object.create(null), vars);
      let resto = restante;
      if (ehRaiz) { segsPadrao.forEach((s) => { const mm = /^\{(\w+)\}$/.exec(s); if (mm) novasVars[mm[1]] = '(default)'; }); }
      else {
        for (const s of segsPadrao) {
          const mm = /^\{(\w+)(=\*\*)?\}$/.exec(s);
          if (mm && mm[2]) { novasVars[mm[1]] = resto.join('/'); resto = []; continue; }
          if (!resto.length) return;
          if (mm) novasVars[mm[1]] = resto[0]; else if (s !== resto[0]) return;
          resto = resto.slice(1);
        }
      }
      const fnsAqui = Object.assign({}, fns, m.fns);
      if (resto.length === 0 && !ehRaiz) {
        m.regras.forEach((r) => {
          if (!r.metodos.some((x) => categoria.includes(x))) return;
          try { if (ev(r.c, { vars: novasVars, fns: fnsAqui }) === true) concedidos.push(r); }
          catch (x) { if (x instanceof ErroRegra) erros.push(x.message); else throw x; }
        });
      }
      m.filhos.forEach((f) => percorrer(f, resto, novasVars, fnsAqui, false));
    }
    percorrer(raiz, segsDoc, Object.create(null), {}, true);
    return { permitido: concedidos.length > 0, consultas: ctx.consultas, consultasUnicas: ctx.unicas.size, erros };
  }

  // estado do banco depois da gravação (para getAfter/existsAfter)
  function aplicar(antes, op) {
    const c = new Map(antes); const p = op.caminho.replace(/^\/+/, '');
    if (op.metodo === 'delete') c.delete(p); else if (op.metodo === 'create' || op.metodo === 'update') c.set(p, op.dados);
    return c;
  }
  return { avaliar };
}

module.exports = { criarSimulador, Ts, Dur };
