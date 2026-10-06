/*
 * Estokio — leitura de planilhas (CSV/XLSX) e de notas fiscais eletrônicas (XML da NF-e).
 * Só funções puras: não acessa o banco nem a tela.
 */
(function () {
  'use strict';

  const SHEETJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  const UNIDADES = ['un', 'cx', 'pct', 'kg', 'g', 'L', 'mL', 'm', 'par'];
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  /* ---------------- modelo da planilha ---------------- */
  const COLUNAS = [
    { chave: 'nome', coluna: 'nome', obrigatoria: true, desc: 'Nome do produto.', ex: ['Água mineral 500 mL', 'Detergente neutro 500 mL'], alias: ['produto', 'descricao', 'nomedoproduto', 'item'] },
    { chave: 'sku', coluna: 'codigo', desc: 'Código interno ou SKU. Serve para reconhecer produtos que já existem.', ex: ['BEB-001', 'LIM-003'], alias: ['sku', 'cod', 'referencia', 'ref', 'codigointerno'] },
    { chave: 'codigoBarras', coluna: 'codigo_barras', desc: 'EAN/GTIN: o número embaixo do código de barras.', ex: ['7891234567895', '7899876543210'], alias: ['ean', 'gtin', 'codigodebarras', 'barras', 'ean13'] },
    { chave: 'categoria', coluna: 'categoria', desc: 'Criada automaticamente se ainda não existir.', ex: ['Bebidas', 'Limpeza'], alias: ['grupo', 'departamento'] },
    { chave: 'unidade', coluna: 'unidade', desc: 'un, cx, pct, kg, g, L, mL, m ou par. Vazio vira un.', ex: ['cx', 'un'], alias: ['un', 'und', 'medida', 'unidademedida'] },
    { chave: 'localizacao', coluna: 'localizacao', desc: 'Onde o produto fica guardado.', ex: ['Depósito, corredor 1', 'Prateleira B2'], alias: ['local', 'endereco', 'posicao'] },
    { chave: 'custo', coluna: 'custo', desc: 'Preço de custo. Aceita 9,50 ou 9.50.', ex: ['9,50', '1,90'], alias: ['precocusto', 'valorcusto', 'precodecusto'] },
    { chave: 'preco', coluna: 'preco', desc: 'Preço de venda.', ex: ['18,00', '3,49'], alias: ['precovenda', 'valorvenda', 'venda', 'precodevenda', 'valor'] },
    { chave: 'estoqueMinimo', coluna: 'estoque_minimo', desc: 'Abaixo disso o produto entra no alerta de reposição.', ex: ['10', '30'], alias: ['minimo', 'estmin', 'estoqueminimo'] },
    { chave: 'quantidade', coluna: 'quantidade', desc: 'Quantidade em estoque hoje. Vira a entrada inicial.', ex: ['24', '42'], alias: ['qtd', 'qtde', 'estoque', 'saldo', 'estoqueatual'] },
    { chave: 'validade', coluna: 'validade', desc: 'Data de validade (opcional). Preenchendo, o produto passa a controlar validade e entra na aba Validades, pelos dias restantes. Aceita 31/12/2027 ou 2027-12-31.', ex: ['31/12/2027', ''], alias: ['datavalidade', 'dtvalidade', 'vencimento', 'dtvencimento', 'venc'] },
    { chave: 'lote', coluna: 'lote', desc: 'Identificação do lote (opcional, só vale com validade preenchida). Vazio vira "Importação".', ex: ['L2403', ''], alias: ['partida', 'lot', 'batch'] },
    { chave: 'fornecedor', coluna: 'fornecedor', desc: 'Nome do fornecedor. Criado automaticamente se ainda não existir.', ex: ['Distribuidora Litoral', 'Limpa Tudo Ltda'], alias: ['fabricante', 'marca'] },
    { chave: 'descricao', coluna: 'observacoes', desc: 'Qualquer anotação sobre o produto.', ex: ['', 'Fragrância lavanda'], alias: ['obs', 'observacao', 'notas'] }
  ];

  function celulaCSV(v) {
    const s = String(v ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  /** Modelo CSV (separado por ponto e vírgula, como o Excel em português abre direto). */
  function modeloCSV() {
    const linhas = [COLUNAS.map((c) => c.coluna)];
    for (let i = 0; i < 2; i++) linhas.push(COLUNAS.map((c) => c.ex[i]));
    return '\uFEFF' + linhas.map((l) => l.map(celulaCSV).join(';')).join('\r\n') + '\r\n';
  }

  /* ---------------- leitura de arquivos ---------------- */
  function lerTexto(arquivo, encoding) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error('Não foi possível ler o arquivo.'));
      r.readAsText(arquivo, encoding);
    });
  }
  function lerBuffer(arquivo) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error('Não foi possível ler o arquivo.'));
      r.readAsArrayBuffer(arquivo);
    });
  }
  function carregarScript(url, global) {
    if (window[global]) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => (window[global] ? res() : rej(new Error('Biblioteca não carregou.')));
      s.onerror = () => rej(new Error('Para ler arquivos do Excel (.xlsx) é preciso internet. Sem conexão, salve a planilha como CSV.'));
      document.head.appendChild(s);
    });
  }

  /** Divide CSV respeitando aspas. Detecta o separador (; , ou tab) pela primeira linha. */
  function parseCSV(texto) {
    texto = texto.replace(/^\uFEFF/, '');
    const primeira = texto.split(/\r?\n/, 1)[0] || '';
    const conta = (c) => primeira.split(c).length;
    const sep = [';', ',', '\t'].sort((a, b) => conta(b) - conta(a))[0];
    const linhas = [];
    let linha = [], campo = '', aspas = false;
    for (let i = 0; i < texto.length; i++) {
      const ch = texto[i];
      if (aspas) {
        if (ch === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
        else campo += ch;
      } else if (ch === '"') aspas = true;
      else if (ch === sep) { linha.push(campo); campo = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && texto[i + 1] === '\n') i++;
        linha.push(campo); linhas.push(linha); linha = []; campo = '';
      } else campo += ch;
    }
    if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
    return linhas;
  }

  /** Lê CSV, TXT, XLSX ou XLS e devolve uma matriz de linhas. */
  async function lerPlanilha(arquivo) {
    const nome = arquivo.name.toLowerCase();
    if (/\.(xlsx|xlsm|xls|ods)$/.test(nome)) {
      await carregarScript(SHEETJS_URL, 'XLSX');
      const wb = window.XLSX.read(await lerBuffer(arquivo), { type: 'array', cellDates: true });
      const aba = wb.Sheets[wb.SheetNames[0]];
      return window.XLSX.utils.sheet_to_json(aba, { header: 1, raw: true, defval: '' });
    }
    // CSV salvo pelo Excel em português costuma vir em Windows-1252 (ANSI), não em UTF-8
    let texto = await lerTexto(arquivo, 'utf-8');
    if (texto.includes('\uFFFD')) texto = await lerTexto(arquivo, 'windows-1252');
    return parseCSV(texto);
  }

  const COL_NOME = COLUNAS.find((c) => c.chave === 'nome');
  const ehColunaNome = (h) => Boolean(h) && (norm(COL_NOME.coluna) === h || h === 'nome' || COL_NOME.alias.includes(h));

  /**
   * Acha a linha do cabeçalho: a primeira, entre as LINHAS_BUSCADAS iniciais, que tem uma célula reconhecida como
   * a coluna "nome". Planilhas às vezes trazem um título ou uma instrução antes da lista de produtos (comum depois
   * de editar no Excel); sem essa busca, essa linha extra seria confundida com o cabeçalho.
   */
  const LINHAS_BUSCADAS = 50;
  function localizarCabecalho(matriz) {
    let primeiraPreenchida = -1;
    for (let i = 0; i < Math.min(matriz.length, LINHAS_BUSCADAS); i++) {
      const l = matriz[i];
      if (!l || !l.some((c) => String(c ?? '').trim() !== '')) continue;   // linha em branco: ignora e segue procurando
      if (primeiraPreenchida < 0) primeiraPreenchida = i;
      if (l.some((c) => ehColunaNome(norm(c)))) return i;
    }
    return primeiraPreenchida;   // não achou "nome" nas primeiras linhas: usa a 1ª linha preenchida nelas, se houver
  }

  /** Transforma a matriz em registros { linha, dados } usando a linha do cabeçalho encontrada. */
  function mapearPlanilha(matriz) {
    const inicio = localizarCabecalho(matriz);
    if (inicio < 0) {
      if (matriz.length > LINHAS_BUSCADAS) throw new Error(`As primeiras ${LINHAS_BUSCADAS} linhas desta planilha estão em branco. Apague as linhas vazias do início, ou baixe o modelo novamente nesta página.`);
      throw new Error('A planilha está vazia.');
    }
    const cab = matriz[inicio].map((c) => norm(c));
    const indice = {};
    const reconhecidas = [], ignoradas = [];
    cab.forEach((h, i) => {
      if (!h) return;
      const col = COLUNAS.find((c) => norm(c.coluna) === h || norm(c.chave) === h || c.alias.includes(h));
      if (col && indice[col.chave] === undefined) { indice[col.chave] = i; reconhecidas.push(col.coluna); }
      else ignoradas.push(String(matriz[inicio][i]).trim());
    });
    if (indice.nome === undefined) throw new Error(`Não encontrei a coluna "nome" nas primeiras ${LINHAS_BUSCADAS} linhas. Se houver um título ou instruções antes da lista de produtos, apague essas linhas, ou baixe o modelo novamente nesta página.`);
    const registros = [];
    for (let r = inicio + 1; r < matriz.length; r++) {
      const l = matriz[r];
      if (!l || !l.some((c) => String(c ?? '').trim() !== '')) continue;
      const dados = {};
      for (const [chave, i] of Object.entries(indice)) dados[chave] = l[i] ?? '';
      registros.push({ linha: r + 1, dados });
    }
    if (!registros.length) throw new Error('A planilha só tem o cabeçalho, sem nenhum produto.');
    return { registros, reconhecidas, ignoradas };
  }

  /** Número no formato brasileiro ou internacional. '' → null; inválido → NaN. */
  function numero(v) {
    if (typeof v === 'number') return v;
    let s = String(v ?? '').trim().replace(/R\$|\s/g, '');
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  /** Confere ano/mês/dia reais (recusa 31/02) e devolve meio-dia UTC em ms, para não cair no dia errado por fuso horário. */
  function dataValida(y, mo, d) {
    if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return NaN;
    const ms = Date.UTC(y, mo - 1, d, 12);
    const dt = new Date(ms);
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? ms : NaN;
  }

  /**
   * Data em dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd, um objeto Date (célula de data do Excel lida pelo SheetJS) ou o
   * número de série de data do Excel (dias desde 30/12/1899, caso a célula não seja reconhecida como data).
   * '' ou vazio → null (sem validade informada). Valor presente e ilegível → NaN.
   */
  function dataPlanilha(v) {
    if (v === '' || v === null || v === undefined) return null;
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? NaN : dataValida(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number') {
      if (!Number.isFinite(v) || v < 20000 || v > 80000) return NaN;   // fora disso não é uma data plausível (anos ~1954–2119)
      const d = new Date(Math.round((v - 25569) * 86400000));
      return dataValida(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    const s = String(v).trim();
    if (!s) return null;
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) { let [, d, mo, y] = m; if (y.length === 2) y = String(Number(y) < 50 ? 2000 + Number(y) : 1900 + Number(y)); return dataValida(Number(y), Number(mo), Number(d)); }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) { const [, y, mo, d] = m; return dataValida(Number(y), Number(mo), Number(d)); }
    return NaN;
  }

  function unidade(v) {
    const s = norm(v);
    if (!s) return 'un';
    const mapa = { un: 'un', und: 'un', unid: 'un', unidade: 'un', pc: 'un', pca: 'un', peca: 'un', cx: 'cx', caixa: 'cx', pct: 'pct', pacote: 'pct', pac: 'pct', fd: 'pct', fardo: 'pct', kg: 'kg', quilo: 'kg', g: 'g', gr: 'g', grama: 'g', l: 'L', lt: 'L', litro: 'L', ml: 'mL', m: 'm', mt: 'm', metro: 'm', par: 'par', pr: 'par' };
    return mapa[s] || null;
  }

  /* ---------------- NF-e ---------------- */
  function lerNFe(texto) {
    const doc = new DOMParser().parseFromString(texto, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Este arquivo não é um XML válido.');
    const tags = (el, tag) => (el ? Array.from(el.getElementsByTagNameNS('*', tag)) : []);
    const t = (el, tag) => { const x = tags(el, tag)[0]; return x ? x.textContent.trim() : ''; };
    const inf = tags(doc, 'infNFe')[0];
    if (!inf) throw new Error('Este XML não é de uma NF-e. Use o XML da nota que o fornecedor enviou (o arquivo que termina em .xml).');
    const ide = tags(inf, 'ide')[0], emit = tags(inf, 'emit')[0], total = tags(inf, 'ICMSTot')[0];
    const chave = (inf.getAttribute('Id') || '').replace(/^NFe/i, '') || `${t(emit, 'CNPJ')}-${t(ide, 'serie')}-${t(ide, 'nNF')}`;
    const itens = tags(inf, 'det').map((det) => {
      const p = tags(det, 'prod')[0];
      const ean = t(p, 'cEAN');
      return {
        item: det.getAttribute('nItem') || '',
        codigo: t(p, 'cProd'),
        ean: /^\d{8,14}$/.test(ean) ? ean : '',
        nome: t(p, 'xProd'),
        unidadeNota: t(p, 'uCom'),
        unidade: unidade(t(p, 'uCom')) || 'un',
        quantidade: Number(t(p, 'qCom')) || 0,
        valorUnit: Number(t(p, 'vUnCom')) || 0,
        valorTotal: Number(t(p, 'vProd')) || 0,
        // Rastreabilidade (medicamentos, alimentos): lote e validade quando o fornecedor informa
        lote: t(tags(p, 'rastro')[0], 'nLote'),
        validade: Date.parse(t(tags(p, 'rastro')[0], 'dVal')) || null
      };
    });
    if (!itens.length) throw new Error('A nota não tem nenhum item.');
    return {
      chave,
      numero: t(ide, 'nNF'),
      serie: t(ide, 'serie'),
      emissao: Date.parse(t(ide, 'dhEmi') || t(ide, 'dEmi')) || null,
      fornecedor: { nome: t(emit, 'xFant') || t(emit, 'xNome'), razao: t(emit, 'xNome'), cnpj: t(emit, 'CNPJ') || t(emit, 'CPF'), telefone: t(emit, 'fone') },
      valor: Number(t(total, 'vNF')) || itens.reduce((s, i) => s + i.valorTotal, 0),
      itens
    };
  }

  window.EstokioImport = { COLUNAS, UNIDADES, modeloCSV, lerPlanilha, mapearPlanilha, numero, unidade, dataPlanilha, lerNFe, lerTexto, norm };
})();
