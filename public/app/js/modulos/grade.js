/*
 * Estokio — Grade (plano Pro e Premium): variações de tamanho, cor ou qualquer outro atributo.
 * Cada variação é um produto comum (tem estoque, código, código de barras e movimentações próprias),
 * ligado ao modelo pela gradeId. Assim tudo o que já existe (leitor, compras, etiquetas) funciona com elas.
 * A tela Grades mostra a matriz de estoque: linhas = 1º atributo, colunas = 2º atributo.
 */
(window.EstokioModulos = window.EstokioModulos || []).push(function (A) {
  'use strict';
  const { state, esc, num, nf, cf, plural, icon } = A;

  const valoresDe = (txt) => Array.from(new Set(String(txt || '').split(/[,;\n]/).map((v) => v.trim()).filter(Boolean)));
  const parteSku = (v) => A.norm(v).replace(/[^a-z0-9]+/g, '').toUpperCase().slice(0, 8);
  const variacoesDe = (g) => state.produtos.filter((p) => p.gradeId === g.id);
  const chaveVar = (vv) => JSON.stringify(Object.keys(vv).sort().map((k) => [k, vv[k]]));

  /** Todas as combinações dos atributos: [{Tamanho:'P', Cor:'Azul'}, ...] */
  function combinacoes(atributos) {
    let lista = [{}];
    for (const at of atributos) {
      const nova = [];
      for (const base of lista) for (const v of at.valores) nova.push({ ...base, [at.nome]: v });
      lista = nova;
    }
    return atributos.length ? lista : [];
  }
  const nomeVariacao = (g, vv) => `${g.nome} (${g.atributos.map((a) => vv[a.nome]).join(', ')})`;
  const skuVariacao = (g, vv) => (g.skuBase ? [g.skuBase, ...g.atributos.map((a) => parteSku(vv[a.nome]))].join('-') : '');

  function matriz(g) {
    const vars = variacoesDe(g);
    const achar = (vv) => vars.find((p) => p.variacao && chaveVar(p.variacao) === chaveVar(vv));
    const [a1, a2] = g.atributos;
    const cel = (vv) => {
      const p = achar(vv);
      if (!p) return '<td class="gm-vazio">·</td>';
      const nv = A.nivel(p);
      return `<td><button class="gm-cel gm-${nv}" data-action="mov" data-tipo="entrada" data-id="${p.id}" title="${esc(p.nome)}: registrar movimentação">${nf.format(num(p.quantidade))}</button></td>`;
    };
    const somaCol = (v2) => vars.filter((p) => p.variacao && p.variacao[a2.nome] === v2).reduce((s, p) => s + num(p.quantidade), 0);
    const somaLin = (v1) => vars.filter((p) => p.variacao && p.variacao[a1.nome] === v1).reduce((s, p) => s + num(p.quantidade), 0);
    const total = vars.reduce((s, p) => s + num(p.quantidade), 0);
    if (!a2) {
      return `<table class="table gm-table"><thead><tr>${a1.valores.map((v) => `<th class="num">${esc(v)}</th>`).join('')}<th class="num">Total</th></tr></thead>
        <tbody><tr>${a1.valores.map((v) => cel({ [a1.nome]: v })).join('')}<td class="num gm-total">${nf.format(total)}</td></tr></tbody></table>`;
    }
    return `<table class="table gm-table">
      <thead><tr><th>${esc(a1.nome)} / ${esc(a2.nome)}</th>${a2.valores.map((v) => `<th class="num">${esc(v)}</th>`).join('')}<th class="num">Total</th></tr></thead>
      <tbody>${a1.valores.map((v1) => `<tr><th scope="row">${esc(v1)}</th>${a2.valores.map((v2) => cel({ [a1.nome]: v1, [a2.nome]: v2 })).join('')}<td class="num gm-total">${nf.format(somaLin(v1))}</td></tr>`).join('')}
        <tr class="gm-rodape"><th scope="row">Total</th>${a2.valores.map((v2) => `<td class="num gm-total">${nf.format(somaCol(v2))}</td>`).join('')}<td class="num gm-total"><strong>${nf.format(total)}</strong></td></tr>
      </tbody></table>`;
  }

  const views = {
    grades: {
      actions: () => `<button class="btn btn-primary" data-action="nova-grade">${icon('plus')}Nova grade</button>`,
      shell: () => `<div id="view-body"></div>`,
      body() {
        if (!state.loaded.grades || !state.loaded.produtos) return A.loading();
        const gs = state.grades.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
        if (!gs.length) {
          return A.emptyState('Nenhuma grade criada',
            'Uma grade é um modelo com variações, como uma camiseta em P, M e G nas cores azul e preta. O Estokio cria um item para cada combinação, com estoque próprio, e mostra tudo numa tabela.',
            `<button class="btn btn-primary" data-action="nova-grade">${icon('plus')}Criar primeira grade</button>`);
        }
        return gs.map((g) => {
          const vars = variacoesDe(g);
          const total = vars.reduce((s, p) => s + num(p.quantidade), 0);
          const baixas = vars.filter((p) => A.nivel(p) !== 'ok').length;
          return `<section class="panel det-bloco grade-panel">
            <header class="panel-head">
              <div class="grupo-tit"><h2>${esc(g.nome)}</h2>
                <span class="p-meta">${g.atributos.map((a) => `${esc(a.nome)}: ${a.valores.map(esc).join(', ')}`).join('. ')}. ${plural(vars.length, 'variação', 'variações')}, ${nf.format(total)} ${esc(g.unidade || 'un')} no total${baixas ? `, <span class="forecast-hot">${plural(baixas, 'precisa', 'precisam')} de reposição</span>` : ''}. ${cf.format(num(g.preco))} cada.</span></div>
              <div class="grupo-acoes">
                <button class="btn btn-sm" data-action="editar-grade" data-id="${g.id}">${icon('editar')}Editar</button>
                <button class="icon-btn i-del" data-action="excluir-grade" data-id="${g.id}" title="Desfazer grade" aria-label="Desfazer a grade ${esc(g.nome)}">${icon('excluir')}</button>
              </div>
            </header>
            <div class="table-wrap flat gm-wrap">${matriz(g)}</div>
          </section>`;
        }).join('') + '<p class="table-foot">Toque num número para registrar entrada, saída ou ajuste daquela variação. Cada variação também aparece em Produtos, com código e estoque mínimo próprios.</p>';
      }
    }
  };

  function gradeForm(g) {
    const ed = Boolean(g);
    g = g || { unidade: 'un', atributos: [{ nome: 'Tamanho', valores: [] }, { nome: 'Cor', valores: [] }] };
    const a1 = g.atributos[0] || { nome: '', valores: [] }, a2 = g.atributos[1] || { nome: '', valores: [] };
    const m = A.openModal(`
      <form id="f-grade" novalidate>
        ${A.modalHead(ed ? `Editar grade ${esc(g.nome)}` : 'Nova grade')}
        <div class="modal-body grid-2">
          <label class="field span-2"><span>Nome do modelo</span><input name="nome" maxlength="80" value="${esc(g.nome)}" placeholder="Ex.: Camiseta básica" autofocus></label>
          <label class="field"><span>Atributo 1</span><input name="a1" maxlength="20" value="${esc(a1.nome)}" placeholder="Ex.: Tamanho"></label>
          <label class="field"><span>Valores do atributo 1</span><input name="v1" value="${esc(a1.valores.join(', '))}" placeholder="Ex.: P, M, G, GG"></label>
          <label class="field"><span>Atributo 2 (opcional)</span><input name="a2" maxlength="20" value="${esc(a2.nome)}" placeholder="Ex.: Cor"></label>
          <label class="field"><span>Valores do atributo 2</span><input name="v2" value="${esc(a2.valores.join(', '))}" placeholder="Ex.: Azul, Preto"></label>
          <label class="field"><span>Código base (SKU)</span><input name="skuBase" maxlength="20" value="${esc(g.skuBase)}" placeholder="Ex.: CAM (vira CAM-M-AZUL)"></label>
          <label class="field"><span>Unidade</span><select name="unidade">${['un', 'par', 'pct', 'cx'].map((u) => `<option ${g.unidade === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
          <label class="field"><span>Categoria</span><select name="categoriaId"><option value="">Sem categoria</option>${A.sortedCats().map((c) => `<option value="${c.id}" ${g.categoriaId === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
          <label class="field"><span>Fornecedor</span><select name="fornecedorId"><option value="">Sem fornecedor</option>${A.sortedForn().map((x) => `<option value="${x.id}" ${g.fornecedorId === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>
          ${A.pode('verCusto') ? `<label class="field"><span>Preço de custo (R$)</span><input name="custo" type="number" min="0" step="0.01" value="${esc(g.custo ?? '')}"></label>` : ''}
          <label class="field"><span>Preço de venda (R$)</span><input name="preco" type="number" min="0" step="0.01" value="${esc(g.preco ?? '')}"></label>
          <label class="field"><span>Estoque mínimo de cada variação</span><input name="estoqueMinimo" type="number" min="0" step="any" value="${esc(g.estoqueMinimo ?? '')}"></label>
          ${ed ? '<label class="check span-2"><input type="checkbox" name="propagar" checked> Aplicar preços, estoque mínimo, categoria e fornecedor às variações que já existem</label>' : ''}
          <p class="muted span-2" id="grade-prev"></p>
          <p class="form-error span-2" role="alert" hidden></p>
        </div>
        <footer class="modal-foot"><button type="button" class="btn" data-action="close-modal">Cancelar</button><button class="btn btn-primary" type="submit">${ed ? 'Salvar grade' : 'Criar grade'}</button></footer>
      </form>`, { wide: true });
    const form = A.$('#f-grade', m);
    const montar = () => {
      const atributos = [];
      if (form.a1.value.trim()) atributos.push({ nome: form.a1.value.trim(), valores: valoresDe(form.v1.value) });
      if (form.a2.value.trim() && valoresDe(form.v2.value).length) atributos.push({ nome: form.a2.value.trim(), valores: valoresDe(form.v2.value) });
      return {
        nome: form.nome.value.trim(), atributos, skuBase: form.skuBase.value.trim().toUpperCase(), unidade: form.unidade.value,
        categoriaId: form.categoriaId.value, fornecedorId: form.fornecedorId.value,
        custo: form.custo ? num(form.custo.value) : num(g.custo), preco: num(form.preco.value), estoqueMinimo: num(form.estoqueMinimo.value)
      };
    };
    const novasDe = (dados) => {
      const existentes = ed ? variacoesDe(g).map((p) => chaveVar(p.variacao || {})) : [];
      return combinacoes(dados.atributos).filter((vv) => !existentes.includes(chaveVar(vv)));
    };
    const prev = () => {
      const d = montar();
      const n = novasDe(d).length;
      A.$('#grade-prev', m).textContent = !d.atributos.length || !d.atributos[0].valores.length ? 'Informe pelo menos um atributo com valores.'
        : ed ? (n ? `Vai criar ${plural(n, 'variação nova', 'variações novas')}.` : 'Nenhuma variação nova.')
        : `Vai criar ${plural(n, 'variação', 'variações')}, por exemplo: ${esc(nomeVariacao(d, combinacoes(d.atributos)[0] || {}))}.`;
    };
    form.addEventListener('input', prev); prev();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const dados = montar();
      if (!dados.nome) return A.showFormError(form, 'Informe o nome do modelo.');
      if (!dados.atributos.length || !dados.atributos[0].valores.length) return A.showFormError(form, 'Informe o atributo 1 e os valores, separados por vírgula.');
      if (dados.atributos.length === 2 && A.norm(dados.atributos[0].nome) === A.norm(dados.atributos[1].nome)) return A.showFormError(form, 'Os dois atributos precisam ter nomes diferentes.');
      if (ed) {
        // Valores retirados que ainda têm estoque não podem sumir da grade
        const faltando = variacoesDe(g).filter((p) => num(p.quantidade) > 0 && p.variacao && !combinacoes(dados.atributos).some((vv) => chaveVar(vv) === chaveVar(p.variacao)));
        if (faltando.length) return A.showFormError(form, `Não dá para tirar valores com estoque: ${faltando.slice(0, 3).map((p) => p.nome).join(', ')}.`);
      }
      const novas = novasDe(dados).map((vv) => ({ variacao: vv, nome: nomeVariacao(dados, vv), sku: skuVariacao(dados, vv) }));
      const repetido = novas.find((v) => v.sku && state.produtos.some((p) => p.sku && A.norm(p.sku) === A.norm(v.sku)));
      if (repetido) return A.showFormError(form, `O código ${repetido.sku} já é de outro produto. Use outro código base.`);
      const limite = num(state.empresa && state.empresa.maxProdutos);
      if (limite && state.produtos.length + novas.length > limite) return A.showFormError(form, `O plano permite até ${limite} produtos e a grade criaria ${novas.length}.`);
      const atualizar = ed && form.propagar && form.propagar.checked ? variacoesDe(g).map((p) => p.id) : [];
      if (ed) dados.id = g.id;
      const btn = form.querySelector('[type=submit]'); A.setBusy(btn, true);
      try {
        await A.DB.salvarGrade(dados, novas, atualizar, state.user);
        A.closeModal();
        A.toast(ed ? `Grade salva${novas.length ? `, com ${plural(novas.length, 'variação nova', 'variações novas')}` : ''}.` : `Grade criada com ${plural(novas.length, 'variação', 'variações')}.`);
      } catch (err) { A.showFormError(form, A.msgErro(err)); A.setBusy(btn, false); }
    });
  }

  async function excluirGrade(id) {
    const g = state.grades.find((x) => x.id === id);
    if (!g) return;
    const n = variacoesDe(g).length;
    if (!(await A.confirmar('Desfazer grade', `A grade <strong>${esc(g.nome)}</strong> deixa de existir. As ${plural(n, 'variação continua', 'variações continuam')} em Produtos, com o estoque e o histórico, como itens comuns.`, 'Desfazer grade'))) return;
    try { await A.DB.deleteGrade(id); A.toast('Grade desfeita.'); } catch (err) { A.toast(A.msgErro(err), 'erro'); }
  }

  return {
    rotas: { grades: { titulo: 'Grades', recurso: 'grade', perm: 'estoque', vitrine: 'Cadastre um modelo, como uma camiseta, e as variações de tamanho e cor. O Estokio cria um item para cada combinação e mostra o estoque numa tabela, com o que está faltando em destaque.' } },
    views,
    acoes: { 'nova-grade': () => gradeForm(null), 'editar-grade': (t) => gradeForm(state.grades.find((g) => g.id === t.dataset.id)), 'excluir-grade': (t) => excluirGrade(t.dataset.id) },
    hooks: {
      estoqueExtra(p) { return p.gradeId && A.recurso('grade') ? '<span class="min-note">Variação de grade</span>' : ''; }
    },
    icones: { grade: '<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M3.5 9.5h17M3.5 15h17M9.5 3.5v17M15 3.5v17"/>' },
    _teste: { combinacoes, nomeVariacao, skuVariacao }
  };
});
