/*
 * Estokio — dados fictícios da demonstração comercial (abre com ?demo=1).
 *
 * Um mercadinho de bairro com 60 dias de história simulada, sempre relativa a hoje:
 * vendas diárias com mais movimento no fim de semana, compras que chegam quando o estoque
 * baixa, lotes com validade consumidos do que vence primeiro, produtos que acabaram,
 * produtos parados, loja e depósito, uma grade de chinelos e uma equipe de três pessoas.
 * O gerador é determinístico: todo visitante vê a mesma loja.
 */
(function () {
  'use strict';

  const DIA = 864e5;
  const HISTORICO = 60;

  function aleatorio(semente) {
    return function () {
      semente = (semente + 0x6D2B79F5) | 0;
      let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** EAN-13 válido (prefixo 789 = Brasil). */
  function ean(n) {
    const base = '7894501' + String(n).padStart(5, '0');
    let s = 0;
    for (let i = 0; i < 12; i++) s += Number(base[i]) * (i % 2 ? 3 : 1);
    return base + ((10 - (s % 10)) % 10);
  }
  const r2 = (n) => Math.round(n * 100) / 100;

  const CATEGORIAS = [['c-beb', 'Bebidas'], ['c-mer', 'Mercearia'], ['c-lat', 'Frios e laticínios'], ['c-pad', 'Padaria'], ['c-lim', 'Limpeza'], ['c-hig', 'Higiene'], ['c-uti', 'Utilidades'], ['c-cal', 'Calçados']];
  const FORNECEDORES = [
    { id: 'f-lit', nome: 'Distribuidora Litoral', prazoEntrega: 3, cnpj: '12345678000190', contato: 'Marina', telefone: '81988887777', email: 'pedidos@litoral.demo', observacoes: 'Entrega às terças e sextas. Pedido mínimo R$ 300.' },
    { id: 'f-ata', nome: 'Atacadão Nordeste', prazoEntrega: 2, cnpj: '23456789000101', contato: 'Sérgio', telefone: '81977776666', email: '', observacoes: 'Prazo de 2 dias úteis.' },
    { id: 'f-lat', nome: 'Laticínios Serra Verde', prazoEntrega: 2, cnpj: '34567890000112', contato: 'João', telefone: '87955554444', email: '', observacoes: 'Visita toda segunda.' },
    { id: 'f-pad', nome: 'Panificadora Sol', prazoEntrega: 1, cnpj: '', contato: 'Dona Lúcia', telefone: '81944443333', email: '', observacoes: 'Entrega diária até 7h.' },
    { id: 'f-lim', nome: 'Limpa Tudo Distribuidora', prazoEntrega: 4, cnpj: '45678901000123', contato: 'Paula', telefone: '81966665555', email: '', observacoes: '' },
    { id: 'f-cal', nome: 'Calçados Praia Mar', prazoEntrega: 6, cnpj: '56789012000134', contato: 'Bruno', telefone: '81933332222', email: '', observacoes: '' }
  ];
  // [nome, sku, categoria, fornecedor, unidade, custo, preço, mínimo, vendas por dia, validade em dias (0 = não controla), local, para de repor X dias antes de hoje]
  const PRODUTOS = [
    ['Água mineral 500 mL, fardo com 12', 'BEB-001', 'c-beb', 'f-lit', 'pct', 9.5, 16.9, 12, 2.6, 0, 'dep', 0],
    ['Refrigerante cola 2 L', 'BEB-002', 'c-beb', 'f-lit', 'un', 6.2, 9.99, 24, 5.1, 0, 'dep', 9],
    ['Refrigerante guaraná 2 L', 'BEB-003', 'c-beb', 'f-lit', 'un', 5.8, 8.99, 18, 3.4, 0, 'dep', 0],
    ['Suco de uva integral 1 L', 'BEB-004', 'c-beb', 'f-lit', 'un', 8.9, 14.9, 8, 0.9, 180, 'loja', 0],
    ['Cerveja lata 350 mL, pack com 12', 'BEB-005', 'c-beb', 'f-lit', 'pct', 28, 41.9, 6, 1.3, 0, 'dep', 0],
    ['Café torrado e moído 500 g', 'MER-001', 'c-mer', 'f-ata', 'pct', 14.5, 22.9, 15, 3.2, 0, 'dep', 0],
    ['Arroz branco tipo 1, 5 kg', 'MER-002', 'c-mer', 'f-ata', 'pct', 21, 29.9, 10, 2.1, 0, 'dep', 0],
    ['Feijão carioca 1 kg', 'MER-003', 'c-mer', 'f-ata', 'pct', 6.8, 9.49, 20, 3.8, 0, 'dep', 7],
    ['Açúcar cristal 1 kg', 'MER-004', 'c-mer', 'f-ata', 'pct', 3.9, 5.79, 20, 2.9, 0, 'dep', 0],
    ['Óleo de soja 900 mL', 'MER-005', 'c-mer', 'f-ata', 'un', 6.4, 8.99, 15, 2.4, 0, 'dep', 0],
    ['Macarrão espaguete 500 g', 'MER-006', 'c-mer', 'f-ata', 'pct', 3.2, 4.99, 20, 2.7, 0, 'dep', 0],
    ['Leite integral 1 L', 'LAT-001', 'c-lat', 'f-lat', 'un', 4.3, 5.99, 36, 7.8, 120, 'loja', 0],
    ['Iogurte de morango 170 g', 'LAT-002', 'c-lat', 'f-lat', 'un', 1.9, 3.49, 20, 4.1, 30, 'loja', 0],
    ['Queijo muçarela fatiado 150 g', 'LAT-003', 'c-lat', 'f-lat', 'pct', 7.2, 11.9, 10, 1.9, 40, 'loja', 0],
    ['Manteiga com sal 200 g', 'LAT-004', 'c-lat', 'f-lat', 'un', 9.8, 14.9, 6, 0.8, 90, 'loja', 0],
    ['Pão de forma tradicional', 'PAD-001', 'c-pad', 'f-pad', 'pct', 5.1, 8.49, 10, 3.3, 10, 'loja', 0],
    ['Bolo de laranja 400 g', 'PAD-002', 'c-pad', 'f-pad', 'un', 8, 13.9, 4, 0.7, 12, 'loja', 0],
    ['Detergente neutro 500 mL', 'LIM-001', 'c-lim', 'f-lim', 'un', 1.9, 3.49, 30, 2.9, 0, 'loja', 0],
    ['Sabão em pó 1 kg', 'LIM-002', 'c-lim', 'f-lim', 'un', 12.9, 19.9, 10, 1.2, 0, 'loja', 0],
    ['Água sanitária 2 L', 'LIM-003', 'c-lim', 'f-lim', 'un', 4.2, 6.99, 12, 1.1, 0, 'loja', 0],
    ['Desinfetante lavanda 2 L', 'LIM-004', 'c-lim', 'f-lim', 'un', 6.4, 11.9, 12, 0.9, 0, 'loja', 20],
    ['Papel higiênico, 12 rolos', 'HIG-001', 'c-hig', 'f-lim', 'pct', 14.8, 22.9, 10, 1.6, 0, 'loja', 0],
    ['Sabonete 90 g', 'HIG-002', 'c-hig', 'f-lim', 'un', 1.6, 2.99, 30, 2.2, 0, 'loja', 0],
    ['Creme dental 90 g', 'HIG-003', 'c-hig', 'f-lim', 'un', 3.1, 5.49, 20, 1.3, 0, 'loja', 0],
    ['Shampoo 350 mL', 'HIG-004', 'c-hig', 'f-lim', 'un', 8.7, 14.9, 8, 0.35, 0, 'loja', 0],
    ['Pilha AA, cartela com 4', 'UTI-001', 'c-uti', 'f-ata', 'un', 9.9, 17.9, 6, 0, 0, 'loja', 0],
    ['Vela de aniversário', 'UTI-002', 'c-uti', 'f-ata', 'pct', 1.1, 2.49, 10, 0, 0, 'loja', 0]
  ];
  // Quanto cada fornecedor realmente leva (o prazo informado é o do cadastro; a Praia Mar demora mais do que diz)
  const PRAZO_REAL = { 'f-lit': 3, 'f-ata': 2, 'f-lat': 2, 'f-pad': 1, 'f-lim': 4, 'f-cal': 7 };
  /** Varia 1 dia, para mais ou para menos, em alguns pedidos: determinístico por fornecedor e dia do pedido. */
  const prazoDoPedido = (forn, dia) => {
    const base = PRAZO_REAL[forn] || 2;
    const h = (forn.charCodeAt(2) * 7 + dia * 13) % 7;
    return Math.max(1, base + (h === 0 ? 1 : h === 1 ? -1 : 0));
  };
  const GRADE = { nome: 'Chinelo de borracha', sku: 'CHI', tamanhos: ['35/36', '37/38', '39/40', '41/42'], cores: ['Azul', 'Preto'], custo: 11, preco: 19.9, minimo: 2 };

  function gerar() {
    const rnd = aleatorio(20261001);
    const agora = Date.now();
    const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
    const inicio = hoje0.getTime() - HISTORICO * DIA;
    const equipe = [
      { id: 'demo', nome: 'Você', email: 'demo@estokio.local', papel: 'dono', peso: 0.3 },
      { id: 'm-carla', nome: 'Carla Souza', email: 'carla@boavista.demo', papel: 'membro', peso: 0.5 },
      { id: 'm-rafael', nome: 'Rafael Lima', email: 'rafael@boavista.demo', papel: 'membro', peso: 0.2 }
    ];
    const quem = (estoque) => {
      if (estoque) return rnd() < 0.7 ? equipe[2].email : equipe[0].email;
      const x = rnd();
      return x < 0.5 ? equipe[1].email : x < 0.8 ? equipe[0].email : equipe[2].email;
    };
    const fornNome = Object.fromEntries(FORNECEDORES.map((f) => [f.id, f.nome]));
    let idSeq = 0;
    const nid = (p) => `${p}${(++idSeq).toString(36)}`;
    let numNota = 4480;
    const movimentacoes = [];
    const notasPorForn = {};
    const pedidosMapa = new Map();   // pedidos de compra já recebidos, um por fornecedor e dia do pedido
    const produtos = [];

    function simular(def) {
      const p = {
        id: nid('p'), nome: def.nome, sku: def.sku, codigoBarras: def.ean, categoriaId: def.cat, fornecedorId: def.forn, unidade: def.un,
        localizacao: def.localizacao || '', custo: def.custo, preco: def.preco, estoqueMinimo: def.min, descricao: '',
        criadoEm: inicio - 5 * DIA, atualizadoEm: agora, criadoPor: equipe[0].email
      };
      if (def.gradeId) { p.gradeId = def.gradeId; p.variacao = def.variacao; }
      if (def.validade) p.controlaValidade = true;
      let qtd = 0;
      let lotes = [];
      const lote = (t) => { const d = new Date(t); return `L${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
      const entrar = (t, q, obs, usuario) => {
        if (t > agora - 600e3) return false;
        const antes = qtd; qtd += q;
        const m = { id: nid('m'), produtoId: p.id, produtoNome: p.nome, sku: p.sku, tipo: 'entrada', quantidade: q, antes, depois: qtd, observacao: obs, usuario, criadoEm: t };
        if (def.validade) {
          const l = { id: nid('l'), lote: lote(t), validade: t + def.validade * DIA, quantidade: q };
          lotes.push(l);
          m.lotes = [{ lote: l.lote, validade: l.validade, quantidade: q }];
        }
        movimentacoes.push(m);
        return true;
      };
      const sair = (t, q) => {
        if (q <= 0 || qtd <= 0 || t > agora - 600e3) return;
        q = Math.min(q, qtd);
        const antes = qtd; qtd -= q;
        const m = { id: nid('m'), produtoId: p.id, produtoNome: p.nome, sku: p.sku, tipo: 'saida', quantidade: q, antes, depois: qtd, observacao: rnd() < 0.85 ? 'Venda no balcão' : 'Venda por encomenda', usuario: quem(false), criadoEm: t };
        if (def.validade) {
          let falta = q; const usados = [];
          lotes.sort((a, b) => a.validade - b.validade);
          for (const l of lotes) { if (falta <= 0) break; const u = Math.min(l.quantidade, falta); l.quantidade -= u; falta -= u; if (u) usados.push({ lote: l.lote, validade: l.validade, quantidade: u }); }
          lotes = lotes.filter((l) => l.quantidade > 0);
          m.lotes = usados;
        }
        movimentacoes.push(m);
      };
      // estoque inicial
      // perecíveis: compra só o que vende antes de vencer
      const pedido = def.validade
        ? Math.max(def.min + 2, Math.round(Math.min(def.ritmo * 18, def.ritmo * def.validade * 0.8)) + def.min)
        : Math.max(def.min * 2, Math.round(def.ritmo * 18) + def.min);
      entrar(inicio + 8 * 3600e3, def.inicial ?? pedido, 'Estoque inicial', equipe[0].email);
      let chegaEm = null, pedidoEm = null, prazoReal = 2;
      for (let d = 0; d <= HISTORICO; d++) { // o último dia é hoje, até a hora atual
        const dia = inicio + d * DIA;
        const semana = new Date(dia).getDay();
        const fator = semana === 6 ? 1.45 : semana === 0 ? 0.65 : semana === 5 ? 1.2 : 1;
        const diasAteHoje = Math.max(1, HISTORICO - d);
        // compra chega de manhã
        if (chegaEm !== null && d >= chegaEm) {
          numNota++;
          const t = dia + (7 + rnd() * 2) * 3600e3;
          if (entrar(t, pedido, `NF-e ${numNota}, ${fornNome[def.forn]}`, quem(true))) {
            (notasPorForn[def.forn] = notasPorForn[def.forn] || []).push({ numero: numNota, t, valor: pedido * def.custo });
            // o pedido de compra correspondente, já recebido, com os dias que o fornecedor levou
            const chave = `${def.forn}|${pedidoEm}`;
            let pc = pedidosMapa.get(chave);
            if (!pc) {
              const criadoEm = inicio + pedidoEm * DIA + 9 * 3600e3;
              const informado = (FORNECEDORES.find((f) => f.id === def.forn) || {}).prazoEntrega || 3;
              pc = { id: nid('pc'), fornecedorId: def.forn, fornecedorNome: fornNome[def.forn], status: 'recebido', itens: [], criadoEm, previsto: criadoEm + informado * DIA,
                recebidoEm: t, diasEntrega: prazoReal, observacao: '', criadoPor: equipe[1].email, recebidoPor: equipe[2].email, atualizadoEm: t };
              pedidosMapa.set(chave, pc);
            }
            pc.itens.push({ produtoId: p.id, nome: p.nome, unidade: def.un, qtd: pedido, recebido: pedido, custo: def.custo });
            pc.recebidoEm = Math.max(pc.recebidoEm, t);
            chegaEm = null;
          }
        }
        // vendas do dia em 1 a 3 movimentos
        // sorteia a fração, para produtos lentos venderem de vez em quando
        const esperado = def.ritmo * fator * (0.55 + rnd() * 0.9);
        let vendas = Math.floor(esperado) + (rnd() < esperado - Math.floor(esperado) ? 1 : 0);
        if (vendas > 0 && def.ritmo > 0) {
          const partes = vendas > 6 ? 3 : vendas > 2 ? 2 : 1;
          for (let k = 0; k < partes; k++) {
            const q = k === partes - 1 ? vendas : Math.max(1, Math.round(vendas / partes));
            vendas -= q;
            sair(dia + (9 + rnd() * 11) * 3600e3, q);
          }
        }
        // pede reposição quando chega ao mínimo (alguns produtos param de ser repostos no fim, para gerar alertas)
        const semRepor = def.paraEm && diasAteHoje <= def.paraEm;
        if (chegaEm === null && qtd <= def.min && def.ritmo > 0 && !semRepor) { pedidoEm = d; prazoReal = prazoDoPedido(def.forn, d); chegaEm = d + prazoReal; }
      }
      p.quantidade = qtd;
      if (def.validade) p.lotes = lotes.map((l) => ({ id: l.id, lote: l.lote, validade: l.validade, quantidade: l.quantidade }));
      // loja e depósito: bebidas e mercearia ficam em parte no depósito
      if (def.local === 'dep' && qtd > 0) {
        const naLoja = Math.min(qtd, Math.ceil(def.min * 0.8));
        p.estoques = { 'loc-loja': naLoja, 'loc-dep': qtd - naLoja };
      } else p.estoques = { 'loc-loja': qtd };
      produtos.push(p);
      return p;
    }

    PRODUTOS.forEach((x, i) => simular({
      nome: x[0], sku: x[1], ean: ean(100 + i), cat: x[2], forn: x[3], un: x[4], custo: x[5], preco: x[6], min: x[7], ritmo: x[8], validade: x[9],
      local: x[10], paraEm: x[11], inicial: x[8] === 0 ? (x[1] === 'UTI-001' ? 14 : 40) : undefined,
      localizacao: x[10] === 'dep' ? 'Depósito, corredor A' : `Gôndola ${'ABCDEFG'[CATEGORIAS.findIndex((c) => c[0] === x[2])] || 'A'}`
    }));

    // grade de chinelos: cada combinação é um produto
    const grade = { id: 'g-chinelo', nome: GRADE.nome, skuBase: GRADE.sku, unidade: 'par', categoriaId: 'c-cal', fornecedorId: 'f-cal', custo: GRADE.custo, preco: GRADE.preco, estoqueMinimo: GRADE.minimo,
      atributos: [{ nome: 'Tamanho', valores: GRADE.tamanhos }, { nome: 'Cor', valores: GRADE.cores }], criadoEm: inicio };
    let gi = 0;
    for (const t of GRADE.tamanhos) for (const c of GRADE.cores) {
      const ritmo = [0.12, 0.3, 0.35, 0.2][GRADE.tamanhos.indexOf(t)] * (c === 'Preto' ? 1.2 : 0.9);
      simular({ nome: `${GRADE.nome} (${t}, ${c})`, sku: `CHI-${t.replace('/', '')}-${c.toUpperCase()}`, ean: ean(300 + gi++), cat: 'c-cal', forn: 'f-cal', un: 'par',
        custo: GRADE.custo, preco: GRADE.preco, min: GRADE.minimo, ritmo, validade: 0, local: 'loja', paraEm: 0, inicial: 8, gradeId: grade.id, variacao: { Tamanho: t, Cor: c }, localizacao: 'Expositor da entrada' });
    }

    // três reposições recentes do depósito para a loja
    const dep = produtos.filter((p) => p.estoques['loc-dep'] > 4).slice(0, 3);
    dep.forEach((p, i) => movimentacoes.push({ id: nid('m'), produtoId: p.id, produtoNome: p.nome, sku: p.sku, tipo: 'transferencia', quantidade: 4,
      antes: p.quantidade, depois: p.quantidade, de: 'loc-dep', deNome: 'Depósito', para: 'loc-loja', paraNome: 'Loja', observacao: 'Reposição da gôndola',
      usuario: equipe[2].email, criadoEm: agora - (i + 1) * 5 * 3600e3 }));

    // notas fiscais lançadas pela entrada de NF-e
    const notas = [];
    for (const [fid, lista] of Object.entries(notasPorForn)) {
      if (!['f-lit', 'f-ata'].includes(fid)) continue;
      lista.slice(-2).forEach((n) => notas.push({ id: `NFE${n.numero}`, numero: String(n.numero), serie: '1', emissao: n.t - DIA, valor: r2(n.valor),
        fornecedorId: fid, fornecedorNome: fornNome[fid], fornecedorCnpj: (FORNECEDORES.find((f) => f.id === fid) || {}).cnpj || '', itens: 1, lancadaPor: equipe[2].email, criadoEm: n.t }));
    }

    const pedidosCompra = Array.from(pedidosMapa.values()).filter((pc) => pc.recebidoEm <= agora).sort((a, b) => a.criadoEm - b.criadoEm);
    pedidosCompra.forEach((pc, i) => { pc.numero = i + 1; });
    // Um pedido ainda a caminho: o papel higiênico, que está abaixo do mínimo, já foi pedido e chega em breve
    const papel = produtos.find((x) => x.sku === 'HIG-001');
    if (papel) {
      const criadoEm = agora - 2 * DIA;
      pedidosCompra.push({ id: nid('pc'), numero: pedidosCompra.length + 1, fornecedorId: 'f-lim', fornecedorNome: fornNome['f-lim'], status: 'aberto', criadoEm, previsto: criadoEm + 4 * DIA,
        itens: [{ produtoId: papel.id, nome: papel.nome, unidade: papel.unidade, qtd: 24, recebido: 0, custo: papel.custo }], observacao: '', criadoPor: equipe[1].email, atualizadoEm: criadoEm });
    }

    const logo = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#F5B82E"/><path d="M14 40l18-20 18 20" fill="none" stroke="#0E3B33" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><rect x="22" y="38" width="20" height="12" rx="2" fill="#0E3B33"/></svg>');

    return {
      empresa: {
        id: 'apresentacao', nome: 'Mercadinho Boa Vista', cnpj: '', telefone: '81999990000', cidade: 'Recife', logo, corPrimaria: '#0e3b33', corDestaque: '#f5b82e',
        acessoAte: agora + 365 * DIA, planoId: 'demonstracao', planoNome: 'Demonstração', planoPreco: 0, planoDias: 365, maxProdutos: 0, origem: 'demonstracao',
        recursos: { ...window.EstokioAssinatura.TODOS },
        pacotes: {}, ativo: true, configurado: true, donoUid: 'demo', donoEmail: equipe[0].email, totalUsuarios: 3, maxUsuarios: 5, criadoEm: inicio - 5 * DIA
      },
      membros: equipe.map((m) => ({ id: m.id, nome: m.nome, email: m.email, papel: m.papel, entrouEm: inicio - 5 * DIA })),
      convites: [], pedidos: [], usados: [],
      categorias: CATEGORIAS.map(([id, nome]) => ({ id, nome, criadoEm: inicio })),
      fornecedores: FORNECEDORES.map((f) => ({ ...f, criadoEm: inicio })),
      locais: [{ id: 'loc-loja', nome: 'Loja', tipo: 'loja', padrao: true, endereco: '', criadoEm: inicio }, { id: 'loc-dep', nome: 'Depósito', tipo: 'deposito', padrao: false, endereco: '', criadoEm: inicio }],
      grades: [grade],
      produtos, movimentacoes, notas, pedidosCompra
    };
  }

  window.EstokioDemoDados = { gerar, ean };
})();
