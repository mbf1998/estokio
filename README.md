# Estokio

Controle de estoque para várias empresas. Você (administrador master) cadastra cada empresa num painel separado e envia um código de ativação. O responsável pela empresa cria a conta com esse código, personaliza o sistema com o logo e as cores da empresa e convida até 4 pessoas (5 usuários no total). Cada empresa só enxerga os próprios dados.

```
estokio/
├── public/                 ← tudo o que vai para o Cloudflare Pages (raiz do domínio)
│   ├── index.html          ← PÁGINA INICIAL: apresentação com o sistema rodando ao vivo
│   ├── assets/             ← estilo e script da página inicial, a logo (SVG), os ícones e a imagem de compartilhamento
│   ├── app/                ← o GESTOR (login, cadastro e o sistema das empresas; também é o app desktop e Android)
│   │   ├── index.html
│   │   ├── css/styles.css
│   │   ├── js/firebase-config.js   ← configuração do Firebase (usada pelo gestor, pelo admin e pela página inicial)
│   │   ├── js/db.js                ← acesso ao Firebase (e modo demonstração)
│   │   ├── js/app.js               ← telas e regras da interface
│   │   ├── js/demo-dados.js        ← a loja fictícia da demonstração
│   │   ├── js/assinatura.js, pix.js, marca.js, importacao.js, scanner.js, previsao.js
│   │   └── js/modulos/             ← validade/lotes/inventário, multiloja, grade, relatórios, etiquetas, pedidos de compra e codigos.js
│   ├── admin/              ← SEU painel master (protegido pelas regras do Firestore)
│   ├── _redirects          ← atalhos: /demo, /cadastro, /entrar
│   ├── _headers            ← cabeçalhos de segurança e cache
│   └── 404.html
├── electron/main.js        ← janela da versão desktop (abre public/app)
├── firestore.rules         ← regras de segurança: publicar no Firebase
├── firebase.json           ← só as regras (a hospedagem agora é o Cloudflare)
├── wrangler.toml           ← configuração do Cloudflare Pages
└── package.json
```

## Publicar no Cloudflare Pages

O Cloudflare hospeda as páginas. O Firebase continua com o login e o banco de dados. Não há etapa de build: o Cloudflare publica a pasta `public/` como está.

**Antes, uma vez:** preencha `public/app/js/firebase-config.js` com os dados do seu projeto Firebase.

**Opção A, pelo GitHub (recomendada):** cada `git push` publica sozinho.

1. Suba o projeto para um repositório no GitHub (a pasta que você já usa, `GitHub\estokio`).
2. No painel do Cloudflare: **Workers & Pages > Create > Pages > Connect to Git**, escolha o repositório.
3. Em **Build settings**: Framework preset **None**, Build command **vazio**, Build output directory **`public`**.
4. Clique em **Save and Deploy**. O endereço fica `https://estokio.pages.dev` (ou o nome que você escolher).

**Opção B, pelo terminal:**

```
npm run deploy
```

Na primeira vez, o Wrangler pede para entrar na sua conta do Cloudflare e cria o projeto `estokio`.

**Depois de publicar, no Firebase (obrigatório):**

1. **Authentication > Settings > Authorized domains > Add domain**: adicione `estokio.pages.dev` e o seu domínio próprio, se tiver. Sem isso, o login e a redefinição de senha podem falhar.
2. Publique as regras: `npm run deploy:regras` (ou `firebase deploy --only firestore:rules`).
3. No painel admin, em **Configurações**, troque o "Endereço do Estokio para os clientes" para `https://SEU-DOMINIO/app/`. É ele que vai nos links das mensagens de ativação e convite.

**Domínio próprio:** no Cloudflare, em **Custom domains > Set up a domain**, adicione, por exemplo, `estokio.com.br`. Se o domínio já estiver no Cloudflare, o DNS é configurado sozinho. Lembre de adicionar o domínio também nos Authorized domains do Firebase.

**Endereços depois de publicado:**

| Endereço | O que abre |
|---|---|
| `/` | Página inicial, com o sistema rodando ao vivo |
| `/demo` | A demonstração completa, sem cadastro |
| `/cadastro` | Criar conta (teste grátis) |
| `/entrar` | Login |
| `/app/` | O gestor. Sem login, volta para a página inicial |
| `/admin/` | Painel admin. Sem login, vai para o login |

**Testar no computador antes de publicar:** `npm run local` e abra http://localhost:5000.

**Se preferir o botão "Upload assets" do Cloudflare** (arrastar um zip, sem GitHub nem terminal): ele exige que o `index.html` esteja na raiz do zip, e não dentro de uma pasta `public/`. As Opções A e B acima publicam a pasta certa sozinhas; para o "Upload assets", abra a pasta `public/` deste projeto, selecione tudo o que está dentro dela e compacte só isso, sem incluir a pasta `public/` em si (senão o Cloudflare procura o `index.html` no lugar errado e mostra 404 em tudo).

## Um login para todos

Existe um login só, o do gestor. Depois de entrar:

- se a conta tem documento em `admins/{UID}` no Firestore, ela vai para o **painel admin**;
- se é de um cliente, vai para a **empresa dele**.

Se um cliente abrir `/admin/` direto, volta para a própria empresa. Se alguém sem login abrir `/admin/`, vai para o login. O painel admin está publicado, mas quem o protege são as regras do Firestore: sem estar em `admins`, ninguém lê nem altera nada. Sair do painel admin leva de volta à tela de login.

## Navegação: cinco grupos, com abas dentro

O menu tem **5 itens**, e cada um abre um grupo com uma barra de abas logo abaixo do título:

| Grupo | Abas |
|---|---|
| **Painel** | Painel, Relatórios |
| **Produtos** | Produtos, Categorias, Grades, Etiquetas, Importar |
| **Estoque** | Movimentações, Validades, Inventário, Locais |
| **Compras** (com o número de produtos para pedir) | Lista de compras, Pedidos de compra, Fornecedores |
| **Empresa** (só o responsável) | Empresa, Equipe |

- Clicar no grupo abre a primeira aba disponível. Os endereços de sempre (por exemplo `#/validades`) continuam funcionando e já marcam o grupo e a aba certos.
- **Cada pessoa vê só o que pode:** o caixa vê Painel, Produtos e Estoque; o estoquista e o gerente também veem Compras; só o responsável vê Empresa. Grupo ou aba sem nada para mostrar some, e uma barra com uma única aba nem aparece.
- **Recursos de plano maior** aparecem como aba com cadeado (por exemplo, Grades no Básico) e levam ao aviso "Disponível a partir do plano Pro", no contexto certo. No celular, a barra de baixo tem os 5 grupos sem rolar.
- A lista de grupos e abas fica em `GRUPOS` e `NOME_ABA`, no começo de `public/app/js/app.js`. Um módulo novo entra num grupo acrescentando a rota na lista do grupo.

## Como funciona

**Teste grátis (autocadastro).** O cliente abre o Estokio, cria a conta e toca em "Teste grátis de 7 dias". Informa o nome da empresa, o CNPJ ou CPF e o WhatsApp, e começa na hora, com todos os recursos liberados. É um teste por e-mail e um por CNPJ/CPF: as regras do Firestore impedem um segundo.

**Fim do teste.** No 8º dia o sistema bloqueia sozinho e mostra "Seu teste grátis terminou", com os três planos lado a lado e o seletor de período. Dois dias antes aparece uma faixa avisando. Os dados ficam guardados.

**Pagamento por Pix.** O cliente escolhe o plano e o período (mensal, trimestral ou anual) e toca em "Pagar por Pix". O app gera o QR Code e o Pix copia e cola **com o valor exato**, no padrão do Banco Central, usando a sua chave, e cria um **pedido** para você. O botão "Já paguei, enviar comprovante" abre o seu WhatsApp. Você confere o Pix no banco e clica em **Confirmar pagamento** no painel admin: a empresa é liberada na hora, com o plano, o período, os limites e os recursos novos, e a tela do cliente se atualiza sozinha.

**Planos.** Básico, Pro e Premium, cada um com preço mensal, trimestral e anual. Veja a seção "Os três planos". Os dias de uma renovação ou de uma troca de plano **somam** ao prazo que ainda resta.

**Sem pacotes adicionais.** Cada plano já traz tudo o que o nível precisa. Quem tem recursos de pacotes antigos continua com eles até trocar de plano.

**Códigos (continuam valendo).** Você ainda pode cadastrar empresas pelo painel e mandar um código EST, e gerar códigos REN de renovação. Os convites de equipe continuam com códigos EQP.

O que cada papel pode fazer:

| | Responsável | Equipe |
|---|---|---|
| Produtos, categorias, entradas, saídas e ajustes | Sim | Sim |
| Excluir produtos | Sim | Não |
| Convidar e remover pessoas | Sim | Não |
| Mudar nome, logo e cores | Sim | Não |
| Escolher plano e pagar | Sim | Não |

Tudo isso é garantido pelas regras do Firestore, não só pela tela.

## Primeiros passos depois de publicar esta versão

1. **Publique as regras** (`npm run deploy:regras`). **É obrigatório nesta versão.** As regras mudaram: cada gravação passou a gastar menos consultas do que o Firestore permite por lote (veja "Limite de consultas", abaixo), e o preço de custo e os kits dependem delas. Com as regras antigas, importar planilha, cadastrar produtos e outras gravações respondem "Você não tem permissão para essa operação", mesmo para o responsável. Se esquecer, o app mostra uma faixa de aviso para o responsável.
2. No painel admin, abra **Planos**. Enquanto você não salvar, a tela mostra os planos padrão com um aviso, e o app e a página inicial já usam esses valores. Clique em **Criar planos padrão**: ele grava o Básico, o Pro e o Premium e atualiza o teste grátis para liberar tudo do Premium. Dali em diante, edite preços, limites e recursos como quiser.
3. Em **Configurações**, preencha o tipo de chave, a chave Pix, o nome e a cidade de quem recebe (iguais aos do banco) e o WhatsApp do suporte. Clique em **Gerar Pix de teste de R$ 1,00** e leia o QR Code com o app do banco: se aparecer o seu nome, está certo.
4. **Clientes que já pagam** continuam no plano antigo até o fim do período, com os mesmos recursos (inclusive os dos pacotes que compraram). Na renovação, escolhem entre Básico, Pro e Premium. A tela Empresa deles avisa isso. Em **Planos > Planos antigos** você vê quantos ainda estão em cada um e pode desativá-los quando ninguém mais precisar.
5. Entre uma vez como responsável de cada empresa, ou peça para os clientes entrarem: é nesse acesso que o preço de custo de cada produto é movido para o registro protegido.

O QR Code é desenhado por uma biblioteca carregada da internet. Sem conexão, o cliente ainda vê o Pix copia e cola, que funciona igual.

## Regras de segurança: testes sem o Firebase e limite de consultas

As regras (`firestore.rules`) decidem quem pode ler e gravar o quê. Como nunca rodaram num Firebase real durante o desenvolvimento, o projeto traz um **simulador das regras** em Node (sem instalar nada além do Node): ele lê o arquivo `firestore.rules` e avalia cada condição.

```
npm run testar:regras
```

| Ferramenta | O que faz |
|---|---|
| `tools/regras/matriz.js` | Executa 45 ações do sistema como cada papel (responsável, gerente, estoquista e caixa), mais um estranho de outra empresa e um visitante sem login, e compara com o que a tela oferece. Falha se a tela oferecer algo que a regra nega, ou se um estranho passar. |
| `tools/regras/fluxos.js` | Simula os fluxos de cadastro e acesso (teste grátis, código de ativação, convite de equipe, renovação, remoção de membro) e os casos de abuso (CNPJ ou e-mail repetido, código reutilizado, equipe cheia, papel melhor que o do convite). |
| `tools/regras/orcamento.js` | Mede quantas consultas a outros documentos cada gravação gasta e quantos itens cabem em cada lote. |

O simulador não é o emulador oficial do Firebase: ele cobre o que as regras do Estokio usam e avisa quando encontra algo que não conhece. Confirme também no emulador oficial (`firebase emulators:start`) antes de uma mudança grande.

**Limite de consultas.** As regras consultam outros documentos (a empresa e o membro) a cada gravação, para saber quem é a pessoa e se a empresa está ativa. O Firestore aceita no máximo **20 consultas por lote ou transação**. Se passar disso, a gravação inteira é recusada com "sem permissão", mesmo para o responsável. Por isso:

- cada gravação usa `papelAtivo()`, que gasta sempre 2 consultas (3 em grade e NF-e);
- o app divide o trabalho em lotes e transações pequenos (`MAX_ESCRITAS` em `js/db.js`): a importação de planilha e de NF-e grava em lotes de até 9 gravações, vários ao mesmo tempo; a venda de kit baixa os itens em grupos de 4; o recebimento de pedido, em grupos de 2 a 3 itens; a grade grava as variações em lotes;
- na venda de kit, todos os itens são conferidos **antes** de baixar qualquer um; se um grupo falhar no meio, a mensagem diz quantos itens já foram gravados;
- **ao criar uma regra nova**, rode `npm run testar:regras`: se uma gravação passar a gastar mais consultas, o orçamento mostra quantos itens ainda cabem num lote.

## Os três planos

| | Básico | Pro | Premium |
|---|---|---|---|
| Mensal | R$ 39,90 | R$ 59,90 | R$ 89,90 |
| Trimestral (10% de desconto) | R$ 107,90 | R$ 161,90 | R$ 242,90 |
| Anual (2 meses grátis) | R$ 399,00 | R$ 599,00 | R$ 899,00 |
| Usuários | 2 | 5 | 10 |
| Produtos | até 500 | ilimitados | ilimitados |
| Estoque, histórico, painel, aviso e previsão de reposição | sim | sim | sim |
| Leitor de código, importação de planilha, lista e pedidos de compra | sim | sim | sim |
| Permissões por pessoa, logo e cores, exportação dos dados | sim | sim | sim |
| NF-e (XML), validade/lotes/inventário, grade, kits, etiquetas | não | **sim** | sim |
| Relatórios, multiloja, integração com lojas online (em breve), suporte prioritário | não | não | **sim** |

- **Teste grátis:** 7 dias com todos os recursos do Premium (até 5 usuários), sem cartão.
- **Trocar de plano** vale na hora, pelo próprio app (Empresa > Renovar ou mudar de plano), e os dias que ainda restam continuam valendo, somados ao novo período. Isso vale para subir e também para descer de plano.
- **Limites:** só travam quem *troca* de plano. Para descer, a empresa precisa caber no plano menor (por exemplo, no máximo 2 pessoas na equipe para ir ao Básico). Renovar o plano atual é sempre possível. Ao descer, o app avisa quais recursos a empresa deixa de ter, e os dados continuam guardados.
- **Recursos bloqueados** aparecem no menu com cadeado e, ao abrir, dizem "Disponível a partir do plano Pro" (ou Premium) e levam à escolha de plano. As regras do Firestore também barram lotes, grade, multiloja, inventário e kits em planos que não os trazem.
- **Preços e recursos** de cada plano são editados em Planos no painel admin. A página inicial e o app leem esses valores, então mudar o preço lá muda no site.

## Página inicial e demonstração

A raiz do domínio (`public/index.html`) é a página de apresentação: título com o tipo de negócio alternando, o **sistema de verdade rodando ao vivo** num quadro (a loja fictícia, em miniatura), a faixa de segmentos, "Do caos ao controle total", funcionalidades, o plano que costuma servir a cada tipo de negócio, os três planos com seletor de período (mensal, trimestral, anual) e a tabela comparativa, lidos do seu catálogo no Firebase, dúvidas e o botão do WhatsApp (o número de Configurações no painel admin). No topo ficam **Fazer login**, **Ver demonstração** e **Começar grátis**.

Clicar no quadro ou em "Ver demonstração" abre a demonstração completa, sem cadastro, dentro do **Mercadinho Boa Vista**.

Quem abre o gestor (`/app/`) sem estar logado volta para a página inicial. Para mudar isso, troque `window.ESTOKIO_TELA_INICIAL` no fim de `public/app/js/firebase-config.js` para `'demo'` (direto na demonstração) ou `'login'`. No app Android, a tela inicial é sempre o login.

| Situação | O que abre |
|---|---|
| Visitante abre o domínio | A página inicial |
| Clica em **Fazer login** | O login |
| Clica em **Começar grátis** | O cadastro |
| Recebe um link de ativação ou convite | O cadastro com o código preenchido |
| Acabou de sair da conta | O login, para entrar com outra conta |
| Já está logado e abre `/app/` | Direto na empresa (ou no painel admin, se for você) |

A loja da demonstração tem:

- 60 dias de história simulada até a hora atual: vendas diárias (mais movimento no sábado), compras que chegam quando o estoque baixa e notas fiscais lançadas;
- produtos acabando (incluindo um dos mais vendidos), um produto zerado, lotes vencidos e vencendo, produtos parados;
- loja e depósito, uma grade de chinelos por tamanho e cor, 6 fornecedores com WhatsApp e uma equipe de 3 pessoas;
- todos os recursos liberados (como no teste grátis) e o sistema com a marca da loja (logo e cores próprios).

O visitante encontra:

- uma mensagem de boas-vindas com três destaques calculados dos dados da loja (o que precisa repor, o que está vencido, quanto dinheiro está parado);
- uma faixa fixa com **Criar minha conta grátis** e **Recomeçar**;
- no Painel, o roteiro **Explore a demonstração**, com 7 coisas para experimentar (lista de compras, registrar uma venda, ler um código, validades, relatórios, grade, trocar as cores), que se marcam conforme ele visita;
- depois de três itens, um convite discreto para criar a conta, uma vez por visita.

Tudo funciona de verdade, mas só no navegador do visitante: nada vai para o Firebase, mesmo com ele configurado. O que depende de uma conta real (escolher plano, pagar por Pix, convidar a equipe) mostra um convite para o teste grátis. "Recomeçar" desfaz o que o visitante fez. A loja é gerada de novo a cada dia, para as datas continuarem fazendo sentido, e é a mesma para todos os visitantes.

Para anúncios, para a bio do Instagram e para mandar no WhatsApp, use `https://SEU-DOMINIO/demo` (a demonstração) ou a raiz do domínio (a página inicial).

Os dados ficam em `public/app/js/demo-dados.js`. Para mudar a loja (nome, produtos, preços, ritmo de vendas), edite as listas no início do arquivo.

## Primeiro acesso guiado

Na primeira entrada do responsável, uma mensagem de boas-vindas resume os três passos principais. No Painel aparece o bloco **Primeiros passos**, que se marca sozinho conforme a empresa usa o sistema, sem precisar clicar em "concluído":

1. Enviar o logo ou mudar as cores
2. Cadastrar pelo menos 3 produtos (ou importar a planilha)
3. Definir o estoque mínimo de algum produto
4. Registrar uma entrada ou saída (as automáticas, de estoque inicial e importação, não contam)
5. Ler um código de barras (só aparece se o plano tiver o leitor)
6. Convidar alguém da equipe

A barra de progresso mostra quantos passos foram feitos e, no teste grátis, quantos dias faltam. Quando tudo termina, o bloco mostra "Tudo pronto". O responsável pode ocultar o bloco a qualquer momento. As boas-vindas e o "ocultar" ficam guardados no aparelho, por empresa.

## Recursos de estoque

### Importar produtos (menu Importar > Planilha de produtos)
Baixe o **modelo CSV** na própria tela, preencha no Excel ou no Google Planilhas e envie como CSV ou XLSX. Antes de gravar, o Estokio mostra uma prévia: o que é produto novo, o que vai atualizar um produto existente (reconhecido pelo código ou pelo código de barras) e quais linhas têm erro, com o motivo. Categorias e fornecedores que não existirem são criados automaticamente. Células vazias nunca apagam dados já cadastrados. CSV salvo pelo Excel em português (ANSI/Windows-1252) é lido corretamente. Para ler XLSX é preciso internet (a biblioteca é carregada na hora); sem conexão, salve a planilha como CSV.

Colunas do modelo: `nome` (obrigatória), `codigo`, `codigo_barras`, `categoria`, `unidade`, `localizacao`, `custo`, `preco`, `estoque_minimo`, `quantidade`, `validade`, `lote`, `fornecedor`, `observacoes`.

`validade` e `lote` são opcionais e só valem para **produtos novos** (numa linha que atualiza um produto já existente, são ignorados, com aviso na prévia: registre a entrada pela tela de Estoque nesse caso). Preenchendo `validade`, o produto já nasce com "Controlar validade e lote" ligado e aparece na aba Validades, pelos dias restantes. Aceita `31/12/2027`, `2027-12-31` ou uma célula de data do Excel. Sem `lote` preenchido, o lote recebe o nome "Importação". Um `lote` preenchido sem `validade` é ignorado, com aviso.

O cabeçalho não precisa estar na primeira linha: o Estokio procura, nas primeiras 50 linhas, a que tem a coluna `nome` (ou um apelido dela, como `produto` ou `descricao`), então um título, instruções ou linhas em branco antes da lista de produtos não atrapalham. Se mesmo assim não encontrar `nome`, a planilha não é gravada e o erro aponta o motivo.

### Gerar SKU e código de barras
No cadastro do produto, o botão ao lado de **Código ou SKU** gera um código com as primeiras letras do nome digitado (sem acento) mais 4 números, conferindo que não repete um SKU já usado. O botão ao lado de **Código de barras** gera um EAN-13 válido (dígito verificador correto) dentro da faixa 20–29, reservada pelo GS1 para uso interno e nunca atribuída a um produto de verdade, também conferindo que não repete um código existente. Os dois continuam editáveis depois de gerados.

### Leitor de código de barras
O botão **Ler código** (no Painel, em Produtos e em Movimentações) abre a câmera. Ao ler um código, mostra o produto com os botões de Entrada, Saída e Ajuste. Se o código não existe, oferece cadastrar um produto com ele. No cadastro do produto também há um botão para ler o código de barras. Leitores USB, que funcionam como teclado, podem ser usados no campo de digitação da mesma janela ou direto na busca de produtos.

No Android e no Chrome do Mac, o Estokio usa o leitor nativo do navegador. No Windows, no app desktop e no iPhone, carrega a biblioteca ZXing na primeira vez (precisa de internet nesse momento). A câmera exige HTTPS no navegador (o Firebase Hosting já é HTTPS). No APK, adicione a permissão de câmera no `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
```

### Entrada pela nota fiscal (menu Importar > Nota fiscal)
Envie o XML da NF-e de compra. O Estokio mostra os itens e liga cada um a um produto seu, procurando nesta ordem: vínculo feito numa nota anterior do mesmo fornecedor, código de barras, código e nome igual. Você pode trocar o produto, cadastrar como novo, não lançar o item ou mudar a quantidade (por exemplo, 2 caixas com 12 viram 24; o custo unitário é recalculado). O fornecedor é reconhecido pelo CNPJ ou cadastrado na hora. A mesma nota não pode ser lançada duas vezes: a chave da NF-e fica registrada em `empresas/{id}/notas`.

### Lista de compras e fornecedores
O Estokio calcula o consumo médio de cada produto com as saídas dos últimos 30 dias e mostra quantos dias o estoque ainda dura. A **Lista de compras** reúne o que está abaixo do mínimo ou vai acabar em até 7, 14 ou 30 dias, sugere a quantidade para cobrir 15 a 90 dias de consumo e separa tudo por fornecedor. Cada pedido pode ser copiado ou enviado direto pelo WhatsApp do fornecedor, e a lista toda pode ser exportada em CSV. O Painel também passa a avisar os produtos que vão acabar nos próximos 7 dias, mesmo que ainda estejam acima do mínimo.

### Prazo de entrega dos fornecedores e hora de pedir (todos os planos)

Cada fornecedor tem um **prazo de entrega**. Há duas fontes, e o Estokio escolhe sozinho:

- **Prazo habitual:** o número de dias que você informa no cadastro do fornecedor (Fornecedores > Editar). Vale enquanto não houver entregas registradas.
- **Prazo real:** ao **receber um pedido de compra**, a tela pergunta "Dias que o fornecedor levou". O número já vem calculado, desde que o pedido foi criado, e você pode corrigir. O Estokio guarda isso no pedido e passa a usar a **média das últimas 10 entregas**, arredondada para cima. Com menos de 3 entregas, o prazo nunca fica abaixo do habitual: uma entrega rápida isolada não encurta o planejamento. Na aba Fornecedores aparecem o prazo em uso, a quantidade de entregas, o menor e o maior prazo, e as últimas entregas de cada um.

Com o prazo, o painel ganha o bloco **Hora de pedir**. Um produto entra nele por um destes motivos:

| Motivo | Quando aparece |
|---|---|
| **Mínimo** | está no mínimo, abaixo dele ou acabou |
| **Prazo** | no consumo atual, vai acabar antes de o fornecedor entregar ("Pedir já"), ou vai chegar ao mínimo antes da entrega (o ponto de pedido é o mínimo mais o consumo diário vezes o prazo do fornecedor) |
| **Vencimento** (planos Pro e Premium, produtos com validade) | simula a saída pelo lote que vence primeiro e vê quanto vai sobrar sem vender. Só avisa se, descontada essa sobra, o estoque aproveitável fica abaixo do ponto de pedido: se há muito estoque bom, um lote vencendo não gera pedido |

- **Pedir já** (vermelho) é quando já passou da hora: abaixo do mínimo, vai faltar antes da entrega ou o lote vence antes de uma nova remessa chegar. Os demais são avisos para pedir com folga.
- **Pedido a caminho:** um pedido de compra aberto que cobre o ponto de pedido tira o produto do alerta. O painel diz quantos já estão a caminho.
- **Sem prazo conhecido:** o aviso continua o de antes (acaba em até 7 dias), e o painel convida a informar o prazo do fornecedor.
- **Onde aparece:** no painel (com o botão **Pedir**, que abre o pedido já preenchido), na **Lista de compras** (com os motivos e o prazo de cada fornecedor), num número no menu **Compras** (vermelho se há "Pedir já") e na aba **Fornecedores** (quantos produtos de cada um estão para pedir).
- **Pedidos novos:** a data de entrega prevista já vem calculada pelo prazo do fornecedor, e a quantidade sugerida desconta o que ainda se vende até a remessa chegar.

O aviso aparece dentro do sistema. Avisos por WhatsApp ou e-mail, mesmo com o sistema fechado, precisariam de uma tarefa agendada no servidor e ainda não existem.

## Recursos em detalhe

### Pedidos de compra com recebimento (todos os planos)
Na **Lista de compras**, o botão **Criar pedido** transforma os itens de um fornecedor num pedido (dá para criar do zero em **Pedidos de compra > Novo pedido**). O pedido pode ser enviado pelo WhatsApp e fica **aguardando entrega**, com a data prevista. Enquanto isso, a lista de compras mostra "N a caminho" e não sugere comprar de novo. Quando a mercadoria chega, **Receber** lança todas as entradas de uma vez. Se veio faltando, o pedido fica "Recebido em parte" e o restante continua a caminho. Quando o plano traz validade e lotes ou multiloja, o recebimento pede o lote e a validade e deixa escolher o local. Opcionalmente, atualiza o preço de custo com o valor do pedido. Pedidos atrasados aparecem no painel.

### Kits e combos (Pro e Premium)
No cadastro do produto, marque **Este produto é um kit ou combo** e escolha os itens e as quantidades (por exemplo, cesta básica: 2 arroz, 1 feijão). O kit não tem estoque próprio: a tabela mostra **quantos kits dá para montar** e a saída de um kit baixa cada item, numa operação só, respeitando validade (sai o que vence primeiro) e local. Se faltar algum item, o sistema diz qual. Um produto que faz parte de um kit não pode ser excluído antes de sair do kit.

### Permissões por pessoa (todos os planos)
Em **Equipe**, o responsável escolhe o papel de cada pessoa (e o papel já vai no convite):

| Papel | Pode |
|---|---|
| Responsável | Tudo |
| Gerente | Tudo, menos plano, equipe e dados da empresa. Vê custos, ajusta, importa, vê relatórios e aprova ajustes |
| Estoquista | Entradas, saídas, cadastro de produtos, pedidos de compra, contagem de inventário. Ajustes viram **pedido de aprovação**. Não vê custos |
| Caixa | Só registra saídas e consulta o estoque. Não vê custos |

Quem era "membro" nas versões anteriores passa a ser **Estoquista**. Os pedidos de ajuste aparecem no painel do responsável e do gerente, com a diferença em unidades e em reais, para aprovar ou recusar.

As permissões valem nas **regras do Firestore**, não só na tela. O **preço de custo** fica num registro separado (`custos/`), que só responsável e gerente conseguem ler: para os outros papéis, o custo nem chega ao navegador. Os produtos antigos são migrados sozinhos no primeiro acesso de um responsável ou gerente depois da atualização.

### Integração com lojas online (Premium, em preparação)
Faz parte do plano básico, mas depende de providências de fora do Estokio: uma conta de desenvolvedor na plataforma (começando pelo Mercado Livre), o cadastro do aplicativo lá e uma chave de serviço do Firebase para o servidor (funções do Cloudflare) que recebe os avisos de venda.

### Recursos do Pro e do Premium

Os próximos recursos estão nos planos **Pro** e **Premium** (os dois últimos, Relatórios e Multiloja, só no **Premium**). Cada um é um arquivo em `public/app/js/modulos/`, ligado ao app por ganchos.

### Validade, lotes e inventário (Pro e Premium)
No cadastro do produto, marque **Controlar validade e lote**. Cada entrada passa a pedir o lote e a validade. As saídas usam primeiro o lote que vence primeiro, ou o lote escolhido. O estoque que o produto já tinha vira o lote "Sem lote". A tela **Validades** mostra o que venceu e o que vence em 7, 30 ou 90 dias, com o valor a custo e o botão **Dar baixa** (saída do lote, com "Descarte: produto vencido" preenchido). O painel ganha o bloco "Validades próximas". Na entrada pela NF-e, o lote e a validade vêm da própria nota quando o fornecedor informa (campo de rastreabilidade); se não, o lote recebe o número da nota.


**Inventário (junto com validade e lotes).** Em **Inventário**, o responsável ou gerente abre uma contagem: todos os produtos, uma categoria ou um local (com Multiloja). A equipe conta pelo celular ou pelo computador, lendo o código de barras ou buscando pelo nome. Cada número é salvo na hora, então várias pessoas podem contar ao mesmo tempo. Na **contagem às cegas** (padrão), quem conta não vê o que o sistema espera. Ao **concluir**, o relatório mostra os contados, as faltas e as sobras, com o valor da diferença, e os ajustes são lançados de uma vez com o nome do inventário. Os produtos não contados ficam como estão (ou podem ser considerados zerados). O histórico guarda cada inventário, com o relatório em CSV.
### Grade (Pro e Premium)
Em **Grades**, cadastre um modelo com até dois atributos (por exemplo, Tamanho: P, M, G e Cor: Azul, Preto). O Estokio cria um produto para cada combinação ("Camiseta básica (M, Azul)", código `CAM-M-AZUL`), com estoque, código de barras e mínimo próprios. Por isso o leitor de código, as compras e as etiquetas funcionam com cada variação. A tela mostra a matriz de estoque, com o que está em falta destacado; tocar num número abre a movimentação daquela variação. Dá para acrescentar valores depois (por exemplo, o tamanho GG). Não dá para tirar valores que ainda têm estoque.

### Multiloja (Premium)
Em **Locais**, crie o local principal: todo o estoque que já existia fica nele. Depois crie as outras lojas e depósitos. Cada movimentação passa a escolher o local (o ajuste de inventário vale para o local contado), e **Transferir** move mercadoria entre locais sem mudar o total. A tabela de produtos mostra quanto há em cada lugar. Um local só pode ser excluído vazio. Observação: os lotes de validade são do produto, não separados por local.

### Relatórios (Premium)
Período de 30, 90, 180 ou 365 dias. Mostra entradas e saídas a preço de custo, margem estimada, valor parado, gráfico mensal, **curva ABC** (quais produtos concentram 80% do valor que sai), **giro e cobertura** (por quantos dias o estoque dura) e **produtos parados**. O botão **Imprimir ou salvar PDF** usa um layout próprio para papel. A curva ABC também sai em CSV. Os valores usam os preços atuais de cada produto.

### Etiquetas (Pro e Premium)
Escolha os produtos (ou "Quantidade = estoque"), o modelo e o que aparece: nome, preço, código de barras, SKU e nome da empresa. Os modelos são folha A4 3 x 11 (70 x 25,4 mm), folha A4 3 x 8 (63,5 x 33,9 mm), folha Carta 3 x 10 (66,7 x 25,4 mm) e impressora térmica de 40 x 25, 50 x 30 ou 60 x 40 mm. Para aproveitar uma folha já usada, escolha em que etiqueta começar. Em **Ajuste fino**, mova a impressão em milímetros se a sua impressora deslocar. Na janela de impressão, escolha escala de 100% (tamanho real).

O código de barras é gerado no próprio app, sem internet: **EAN-13** quando o produto tem um código de barras válido e **Code 128** nos demais casos (SKU ou código interno). Os dois foram conferidos lendo etiquetas impressas com um leitor de verdade (OpenCV) e contra a implementação do ReportLab.

## A marca

A logo é a **caixa de estoque com o E** das barras de nível na face: a barra amarela do meio é a que está acabando. Os arquivos estão em `public/assets/` (página inicial e 404) e em `public/app/assets/` (app e admin), todos em SVG com o nome convertido em contornos:

| Arquivo | Uso |
|---|---|
| `estokio-logo.svg` | logo horizontal para fundo claro |
| `estokio-logo-claro.svg` | logo horizontal para fundo escuro |
| `estokio-simbolo.svg`, `estokio-simbolo-claro.svg` | só o símbolo, para fundo claro e escuro |
| `icon.svg`, `favicon.ico` | aba do navegador: versão simplificada (cubo com a fita), que se lê em 16 px |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` | app instalado no celular (PWA) |
| `og.png` | imagem que aparece ao compartilhar o link (WhatsApp, Instagram) |

A letra do nome é a Noto Sans, não a Archivo do restante do site. Se um designer refinar a logo, basta trocar esses arquivos pelos novos, com os mesmos nomes.

## Validade do acesso e renovação

Cada empresa tem uma data de vencimento (`acessoAte`). O código de ativação já inclui alguns dias de acesso (você escolhe no cadastro: 7 a 365 dias).

- **Renovar:** no painel admin, clique em **Renovar** na linha da empresa, escolha quantos dias adicionar e envie o código `REN-XXXX-XXXX-XXXX` ao cliente.
- **Aplicar:** o responsável abre **Empresa > Validade do acesso** e digita o código. Pode ser aplicado antes de vencer: os dias entram somados ao prazo atual, sem perder nenhum. Se já venceu, os dias contam a partir do momento em que ele aplicar.
- **Aviso:** a partir de 7 dias antes do vencimento, aparece uma faixa no topo do sistema para toda a equipe. O responsável vê um atalho para inserir o código.
- **Vencido:** o estoque fica bloqueado para todos (as regras do Firestore recusam leitura e escrita). O responsável vê uma tela para digitar o código de renovação; a equipe vê um aviso para falar com ele. Nenhum dado é apagado.
- O código de renovação é ligado a uma empresa, só o responsável dela consegue usar, e vale uma única vez. Fica válido por 1 ano para ser aplicado. Gerar outro para a mesma empresa cancela o anterior que ainda não foi usado.
- A contagem é em dias corridos, porque é calculada e conferida pelas regras do Firestore, que não conhecem feriados nem fins de semana.

Empresas ativadas numa versão anterior, sem data de vencimento, continuam liberadas sem prazo até receberem a primeira renovação.

## Configuração do Firebase (uma vez)

1. Crie um projeto em https://console.firebase.google.com.
2. **Authentication** > Começar > Método de login > ative **E-mail/senha**.
3. **Firestore Database** > Criar banco de dados > modo produção > região `southamerica-east1` (São Paulo).
4. Configurações do projeto > Seus apps > ícone **</>** > registre o app e copie o `firebaseConfig` para `public/app/js/firebase-config.js`.
5. Publique as regras. No console: Firestore > Regras > cole o conteúdo de `firestore.rules` > Publicar. Ou pelo terminal:
   ```
   npm install -g firebase-tools
   firebase login
   firebase use --add
   firebase deploy --only firestore:rules
   ```

### Criar a sua conta de administrador master

1. No console: **Authentication** > Usuários > **Adicionar usuário**, com seu e-mail e senha.
2. Copie o **UID** que aparece na lista.
3. **Firestore Database** > Iniciar coleção > ID da coleção `admins` > ID do documento: cole o UID > adicione um campo `email` (string) com seu e-mail > Salvar.

Essa é a única coisa feita à mão. Ninguém consegue se tornar admin pelo aplicativo: a coleção `admins` é bloqueada para escrita nas regras.

## Painel admin

Abra `public/admin/index.html` com dois cliques e entre com a conta de admin. A pasta `admin/` fica fora de `public/app/`, então não é publicada no site nem entra no instalador desktop ou no APK.

**Empresas.** Lista com situação, plano, vencimento, último uso e código pendente. Filtros para "vencem em até 7 dias" e "sem uso há 15 dias" (o cliente que provavelmente não vai renovar). Clique numa empresa para abrir o detalhe.

**Detalhe da empresa.** Acesso e plano, uso (último acesso, produtos, movimentações dos últimos 30 dias, última movimentação), contato, usuários com o último acesso de cada um, cobranças e o histórico de ações daquela empresa. Ferramentas de suporte:
- renovar, cobrar, suspender e reativar;
- ajustar o vencimento na mão (exige um motivo, que fica no histórico);
- trocar o plano e mudar o limite de usuários;
- gerar convite de equipe, tornar outra pessoa responsável e remover usuários;
- editar os dados de contato.

**Financeiro.** No topo ficam os **Pix aguardando sua confirmação**: os pedidos que os clientes geraram no app, com o valor, o identificador do Pix e uma conferência automática ("Confere com a tabela" ou "Diferente da tabela", caso alguém tente pagar menos). Confirmar libera a empresa e registra a cobrança; recusar pede um motivo. O menu Financeiro mostra quantos pedidos esperam. Abaixo: recebido no mês, a receber, previsão de 30 dias, gráfico de 6 meses, vencimentos próximos e todas as cobranças, com exportação em CSV.

**Cobrar.** Abre o WhatsApp do cliente com uma mensagem pronta: vencimento, plano, valor e sua chave Pix. Você revisa o texto antes de enviar.

**Planos.** Os três planos com os três preços de cada um, o valor equivalente por mês e o desconto calculados sozinhos, mais limites e recursos. Enquanto não forem salvos, aparecem os planos padrão, com o botão **Criar planos padrão**. A opção "Vendido no app" define se o cliente pode escolher o plano e pagar por Pix sozinho, e "Mais escolhido" põe a fita no cartão. Ao editar um plano, dá para aplicar os limites e recursos novos às empresas que já estão nele. Os planos antigos ficam numa seção própria, com a contagem de empresas em cada um e a opção de desativar. No detalhe de uma empresa, **Trocar** muda plano e período na hora, sem cobrar.

O app respeita o plano: esconde os recursos não incluídos e bloqueia produtos acima do limite. A NF-e também é bloqueada pelas regras do Firestore. O limite de produtos é conferido só no app (conferir no servidor exigiria Cloud Functions).

**Histórico.** Tudo o que é feito no painel fica registrado na coleção `auditoria`, com data, ação, empresa, detalhes e o e-mail do admin. Os registros não podem ser alterados nem apagados, nem pelo próprio admin.

**Configurações.** Tipo e chave Pix, nome e cidade de quem recebe (montam o QR Code do app), WhatsApp do suporte (recebe os comprovantes), endereço do Estokio para os clientes e um texto extra para as mensagens de cobrança. Ficam em `config/publico`, que o app lê.

**Empresas.** A lista mostra pagantes, empresas em teste grátis (com a taxa de conversão de teste para pagante), vencimentos e o último uso. Filtros para "Em teste grátis" e "Teste encerrado, sem pagar", que são os clientes para chamar no WhatsApp.

**LGPD.** No detalhe da empresa: "Exportar dados (JSON)" gera uma cópia completa (estoque, movimentações, fornecedores, notas, usuários, cobranças e convites), e "Excluir empresa e todos os dados" apaga tudo definitivamente, depois de confirmar com o nome da empresa e o motivo. As cobranças ficam guardadas por obrigação fiscal. As contas no Authentication precisam ser apagadas pelo console: o painel mostra a lista de e-mails ao terminar. O responsável da empresa também pode baixar os dados no app, em Empresa > Seus dados.

## Testar sem Firebase

Com `firebase-config.js` vazio, `public/app/index.html` abre em **modo demonstração**: uma empresa de exemplo em que você é o responsável, começando pela tela de personalização. Dá para testar cores, logo, produtos e a tela de equipe. Os códigos de convite são gerados, mas só funcionam com o Firebase.

## Versão desktop (Windows, Linux, macOS)

Precisa do Node.js 18 ou mais novo.

```
npm install
npm start            abre o Estokio numa janela própria
npm run dist:win     gera o instalador .exe em dist/
```

## Próximo passo: app Android (APK)

```
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init Estokio com.estokio.app --web-dir public/app
npx cap add android
npx cap open android      no Android Studio: Build > Build APK(s)
```

Depois de mudanças em `public/app/`, rode `npx cap sync android`.

## Estrutura do banco (Firestore)

| Caminho | O que guarda |
|---|---|
| `admins/{uid}` | administradores master (criados à mão) |
| `planos/{id}` | os planos (Básico, Pro, Premium): três preços, limites, recursos, "mais escolhido", se é vendido no app (leitura pública, para a página inicial). O teste grátis também é um plano |
| `pedidos/{id}` | pedidos de pagamento por Pix, criados pelo app e confirmados pelo admin |
| `testes/{email}` e `cnpjs/{documento}` | impedem mais de um teste grátis por e-mail e por CNPJ/CPF |
| `cobrancas/{codigo}` | uma por código gerado: valor, forma de pagamento, situação |
| `auditoria/{id}` | histórico imutável das ações do admin |
| `config/publico` | chave Pix, recebedor, WhatsApp do suporte, endereço do app (lido pelo app) |
| `convites/{codigo}` | códigos EST (ativação), EQP (equipe) e REN (renovação): empresaId, status, dias, prazo para usar |
| `usuarios/{uid}` | a qual empresa a conta pertence e o papel (dono ou membro) |
| `empresas/{id}` | nome, CNPJ, logo em base64, cores, situação, contador de usuários, vencimento (`acessoAte`), plano, recursos, último acesso |
| `empresas/{id}/membros/{uid}` | quem tem acesso |
| `empresas/{id}/produtos` | produtos (com `lotes` e `estoques` por local quando o plano traz esses recursos) |
| `empresas/{id}/categorias` | categorias |
| `empresas/{id}/movimentacoes` | histórico imutável de entradas, saídas e ajustes |
| `empresas/{id}/fornecedores` | fornecedores: nome, CNPJ, contato, WhatsApp, e-mail e `prazoEntrega` (dias, opcional) |
| `empresas/{id}/notas/{chave}` | NF-e já lançadas (impede lançar a mesma nota duas vezes) |
| `empresas/{id}/locais` | lojas e depósitos (Multiloja, plano Premium) |
| `empresas/{id}/grades` | modelos com variações (Grade, planos Pro e Premium) |
| `empresas/{id}/custos/{produto}` | preço de custo de cada produto (só responsável e gerente leem) |
| `empresas/{id}/solicitacoes` | ajustes pedidos pela equipe, aguardando aprovação |
| `empresas/{id}/pedidosCompra` | pedidos de compra, o que já foi recebido e `diasEntrega` (quantos dias o fornecedor levou) |
| `empresas/{id}/inventarios` | contagens de inventário e os relatórios de diferenças |

## Observações

- Remover alguém da equipe tira o acesso na hora, mas a conta dele continua existindo no Authentication. Ela pode ser apagada pelo console, se quiser.
- Cada conta pertence a uma empresa só. Para usar o Estokio em outra empresa, a pessoa precisa de outro e-mail.
- Os dados da versão anterior (coleções `produtos`, `categorias` e `movimentacoes` na raiz) não são lidos por esta versão. Se já tinha dados de teste, apague essas coleções pelo console.
