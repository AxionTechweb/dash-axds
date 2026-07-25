# Prompt de implantação — do zero até funcionando

Este documento tem três partes:

1. **Como o painel funciona** — o essencial para entender a implantação.
2. **O prompt** — copie e cole num agente de código (Claude Code, Cursor, etc.) aberto
   na pasta do projeto. Ele conduz a implantação e valida cada etapa.
3. **Os passos manuais** — o que **só você** pode fazer (criar contas, gerar tokens,
   cadastrar webhooks). Marcados com 🧑; o agente para e pede quando chegar a hora.

> ⚠️ **A etapa da venda real não é opcional.** É ela que valida a atribuição de
> verdade. Não aponte tráfego pago antes de concluí-la.

---

## Como a atribuição funciona

O painel cruza cada venda com o anúncio da Meta **sempre por ID exato** (`{{ad.id}}`),
nunca por nome de campanha. O `ad_id` chega pelo **payload do webhook** do checkout:

```
Anúncio na Meta       →  utm_content={{ad.id}} na URL da landing page
Seu código externo    →  propaga para o link do checkout no parâmetro da plataforma
Webhook do checkout   →  devolve o parâmetro para este painel
Painel                →  grava em purchases.ad_id e cruza com a Meta por ID exato
```

O parâmetro do link do checkout depende da plataforma (a tela de Integrações mostra qual
ao selecioná-la): **Hotmart usa `xcod`**, as demais usam `utm_content`. O `ad_id` só é
aceito se for **numérico** — qualquer outra coisa é descartada e a venda entra como
orgânico, **gravada do mesmo jeito**.

### Captura própria (snippet) — OPCIONAL

O modo padrão **não** usa snippet nas landing pages: quem leva o `ad_id` ao checkout é um
código de rastreio externo, e o painel lê tudo do webhook. O snippet
(`public/track.js`) continua disponível, mas só acrescenta o que o webhook não tem:
checkouts iniciados, funil, page views e a aba Eventos. **Nada da atribuição por anúncio
depende dele.** Sem snippet, `purchases.match` fica `none` — é o esperado, não é falha.

| Funciona sem snippet | Fica vazio sem snippet |
|---|---|
| Faturamento, lucro, ROAS, CPA | Checkouts iniciados |
| Vendas por anúncio / campanha / conjunto | Funil (views → checkouts) |
| Gasto, impressões, CPM, CTR, CPC (Meta) | Page views e a aba Eventos |
| UTMs, produto e regiões de cada venda | — |
| Regras, financeiro, vendas em tempo real | — |

---

## Plataformas de checkout

Suportadas: **Hotmart, Kiwify, Kirvano, Perfect Pay, Ticto, Cakto, Greenn**. Todas passam
pela mesma rota `/api/webhook/<plataforma>`, dirigida pelo registro em
`src/lib/checkout/platforms.ts`.

⚠️ **Confirmadas contra um payload real:** Hotmart, Kiwify, Kirvano, Perfect Pay.
**Parciais** (estrutura conhecida, mas com um ponto em aberto): **Ticto** (o ad_id não
apareceu num exemplo com anúncio), **Cakto** (o exemplo recebido era uma lista de API, o
envelope do webhook pode diferir), **Greenn** (o header de autenticação não foi
verificado). A interface avisa isso em cada uma. Isso **não** faz perder venda: o
`raw_webhook` é sempre salvo, mesmo quando um campo não é lido. A primeira venda real
revela o que falta, e a correção é editar o registro — não escrever código.

O caso de maior atenção é o **valor**: para a **Kiwify** o código assume centavos e
divide por 100 (se estiver errado, sai 100× errado). Nas demais não-confirmadas o valor
é usado como veio. Confira sempre contra a venda real. Detalhes no apêndice.

---

## Design do painel (sistema "Finex")

O front segue uma referência de tema escuro, **dirigida por tokens** — mudanças visuais
entram pelo centro, não por classes soltas nas páginas.

| Camada | Onde | O que define |
|---|---|---|
| Tokens | `src/app/globals.css` | Cores HSL, raio, fontes, utilitários (`.micro-label`, `.stat-value`, `.display-title`, `.flashlight`) |
| Fontes | `src/app/layout.tsx` | Plus Jakarta Sans (corpo), Oswald (display), JetBrains Mono (rótulos/números) |
| Primitivos | `src/components/ui/` | `Card`/`SectionHeading`, `Button`/`PillGroup`, `Input`, `Flashlight` |
| Painel | `src/components/panel/` | `KpiCard`, `Sidebar`, `Header`, gráficos |

A cor primária sai de `--primary` e o branding da instância pode sobrescrevê-la —
inclusive nos gráficos. O tema claro segue funcional. Nenhuma cor de marca presa no
código.

---

## Antes de começar — o que você precisa ter

| Item | Para quê | Custo |
|---|---|---|
| Conta no [Supabase](https://supabase.com) | Banco, autenticação e realtime | Free serve |
| Conta na [Vercel](https://vercel.com) | Deploy | Free serve |
| Conta no GitHub | Origem do deploy | — |
| [Meta Business Manager](https://business.facebook.com) | Token de leitura dos anúncios | — |
| Uma plataforma de checkout | Webhook de compra | — |
| Seu código de rastreio | Levar o `ad_id` ao checkout | — |

---

## O PROMPT (copie tudo abaixo)

````text
Você é meu parceiro de implantação. O projeto nesta pasta é um painel de tracking e
atribuição (Next.js 16 + Supabase), distribuído como template white label. Leia
CLAUDE.md, README.md e SECURITY.md antes de começar.

Seu objetivo: colocar este painel funcionando de verdade, validando cada etapa com
evidência real (query no banco, resposta HTTP, linha gravada) — nunca declare que algo
funciona sem ter verificado.

REGRAS:
- Trabalhe uma ETAPA por vez. Ao fim de cada uma, me mostre o que verificou e espere
  meu OK antes de seguir.
- Quando precisar de algo que só eu posso fazer (marcado com 🧑), PARE e me dê
  instruções exatas, incluindo onde clicar.
- NUNCA me peça para colar segredos no chat. Peça para eu escrever direto no
  .env.local ou no painel da Vercel. (A chave anon e o Reference ID não são segredos e
  podem ser ditos.)
- AS INTEGRAÇÕES (conta da Meta e checkout) SÃO CONECTADAS POR MIM, NA TELA DE
  /integracoes, CLICANDO. Você não conecta a Meta nem cadastra webhook por comando,
  script ou ação — só me guia nos cliques e interpreta o que a tela mostrar. Nunca me
  peça o token da Meta nem o segredo do webhook para você usar.
- Se algo falhar, me mostre o erro real e a causa provável antes de tentar corrigir.
- Não contorne autenticação nem desligue RLS "para testar". Se algo bloquear, o
  bloqueio provavelmente está certo — investigue a causa.
- Se eu disser que já fiz algo, VERIFIQUE antes de seguir (uma query, uma resposta
  HTTP) — não confie só no meu "ok".
- A rota de webhook é ÚNICA e genérica (/api/webhook/<plataforma>), dirigida pelo
  registro em src/lib/checkout/platforms.ts. NÃO crie rota nova por plataforma.
- O design é dirigido por tokens (globals.css) e primitivos (src/components/ui). NÃO o
  desfaça com classes soltas nas páginas.

---

ETAPA 0 — QUAL CHECKOUT EU VOU USAR

Antes de qualquer coisa, ME PERGUNTE qual(is) plataforma(s) de checkout eu uso, entre:
Hotmart, Kiwify, Kirvano, Perfect Pay, Ticto, Cakto, Greenn. Espere a resposta.

Depois:
  1. Trate as etapas seguintes só para a(s) plataforma(s) que eu escolhi.
  2. Me diga qual parâmetro o meu código externo precisa pôr no link do checkout para
     carregar o ad_id (Hotmart: xcod; demais: utm_content) e que o valor tem que ser o
     {{ad.id}} da Meta — SÓ DÍGITOS.
  3. ⚠️ Se a minha plataforma NÃO for a Hotmart, me avise que ela ainda não foi
     confirmada contra um payload real: os caminhos dos campos e o header de
     autenticação são candidatos, e a primeira venda real vai confirmar. Se for a
     Kiwify, destaque o risco do valor em centavos.

---

ETAPA 1 — BANCO DE DADOS

🧑 Eu vou:
  a) Criar um projeto novo em supabase.com (anote a região mais próxima).
  b) Em Project Settings → API, copiar: URL do projeto, chave anon/publishable e chave
     service_role/secret.
  c) Em Authentication → Providers → Email, DESMARCAR "Allow new users to sign up".
     (Passo crítico: sem isso qualquer pessoa cria conta no painel.)

Você faz:
  1. Rodar `npm install`.
  2. Criar o .env.local a partir do .env.example e me dizer exatamente quais linhas
     preencher. Para ENCRYPTION_KEY, SETUP_TOKEN e CRON_SECRET, GERE valores aleatórios
     fortes para mim (ex.: `openssl rand -base64 48`) e explique que a ENCRYPTION_KEY,
     se perdida, torna os segredos do banco irrecuperáveis.
  3. Depois que eu confirmar que preenchi, VALIDAR o .env.local sem imprimir os valores
     (ex.: decodificar o "role" dos JWTs para confirmar que a service_role não é a anon
     duplicada).
  4. Me guiar a aplicar o schema. Duas opções — me ofereça as duas:
       a) colar supabase/setup.sql no SQL Editor do Supabase (sem CLI); ou
       b) `npx supabase link --project-ref <REF>` + `npx supabase db push`.
  5. VALIDAR de verdade, contra o banco, e me mostrar a saída:
     - todas as tabelas criadas e RLS habilitada em cada uma (prove a RLS numa tabela
       COM dados: a chave anon não pode enxergar a linha de branding);
     - as funções app_encrypt, app_decrypt, identify_visitor, log_event,
       rate_limit_hit, rate_limit_cleanup existem;
     - o ida-e-volta app_encrypt→app_decrypt fecha com a ENCRYPTION_KEY real;
     - branding tem exatamente 1 linha;
     - checkout_integrations existe;
     - o cadastro público está OFF (um POST em /auth/v1/signup com a anon deve dar
       422 signup_disabled).

---

ETAPA 2 — SUBIR LOCAL E CRIAR O PRIMEIRO ACESSO

Você faz:
  1. `npm run dev`.
  2. Confirmar que /login responde 200 e que as rotas do painel (/dashboard,
     /campanhas, /vendas, /financeiro, /integracoes, /regras, /admin, /configuracoes)
     redirecionam para /login (307). Isso prova a proteção de rotas.
  3. Me instruir a acessar /setup e preencher SETUP_TOKEN, e-mail, senha e o nome da
     primeira área.
  4. Confirmar no banco: 1 usuário, 1 área, 1 linha em settings vinculada. Confirmar
     que /setup agora mostra "Setup já concluído".
  5. Me instruir a fazer login e confirmar que o painel abre.

---

ETAPA 3 — DADOS DE EXEMPLO E REALTIME (opcional, mas recomendado)

Você faz:
  1. Rodar `node scripts/seed.mjs` e me pedir para abrir Dashboard, Campanhas, Vendas e
     Financeiro e confirmar que os números aparecem. (Campanhas fica vazia até conectar
     a Meta — é esperado.)
  2. Testar o feed em tempo real: eu deixo o Dashboard aberto, você insere uma compra
     aprovada direto no banco e confirmamos que ela aparece SEM eu recarregar. Se
     falhar, investigue a publicação supabase_realtime.
  3. Ao fim, rodar `node scripts/seed.mjs --clear` e confirmar, com query, que os dados
     de exemplo sumiram. Não quero dado fictício misturado com dado real.

---

ETAPA 4 — CONTA DE ANÚNCIOS DA META

⚠️ A CONEXÃO É FEITA POR MIM, NO PAINEL, CLICANDO. Você NÃO conecta a Meta por
comando, script ou ferramenta — nem me peça o token para colar em lugar nenhum.
Seu papel aqui é só me guiar e, se a TELA mostrar um erro, interpretá-lo.

🧑 Primeiro eu gero o token. Me dê o passo a passo exato:
  - business.facebook.com → Configurações do negócio → Usuários → Usuários do sistema
  - criar um usuário do sistema com função de admin
  - Adicionar ativos → vincular a CONTA DE ANÚNCIOS com permissão total
  - Gerar novo token → selecionar o app → marcar ads_read E ads_management
  - copiar o token (ele não expira)

🧑 Depois eu conecto NO PAINEL: Integrações → Meta Ads → colo o token no campo →
clico em "Buscar contas" → marco as minhas contas → clico em "Conectar
selecionadas". (O painel descobre as contas pelo token; não existe campo de
act_<id> para digitar.)

Você faz:
  1. Me lembrar da sequência de cliques acima. NÃO tente conectar por mim.
  2. Se a busca falhar, interpretar o erro que apareceu NA TELA:
     - "Faltam escopos" → o token não tem ads_read/ads_management;
     - "não enxerga nenhuma conta" → falta vincular a conta ao System User em Adicionar
       ativos, no Business Manager;
     - token inválido/expirado → gerar de novo.
  3. Confirmar que a página Campanhas carrega dados reais. Se vier vazia, verificar se
     há campanhas no período selecionado.

---

ETAPA 5 — WEBHOOK E VENDA REAL  ⚠️ ETAPA MAIS IMPORTANTE

⚠️ A CONEXÃO DO CHECKOUT TAMBÉM É FEITA POR MIM, NO PAINEL. Você NÃO cadastra
webhook nem salva segredo por mim — não me peça o hottok/token para colar. Seu
papel começa depois, na conferência da venda real.

🧑 No painel, em Integrações → Checkout, eu seleciono a minha plataforma. A tela mostra
a URL do webhook e o passo a passo. Eu cadastro essa URL na plataforma, marco os
eventos de compra, copio o segredo (hottok / token / assinatura) e colo no campo do
painel — tudo clicando, sem você.

🧑 Eu vou conferir que meu código externo põe o ad_id no checkout. Me diga como testar
ANTES da compra: abrir a landing page com ?utm_content=999999999999 e inspecionar o
link do botão de checkout, confirmando que o parâmetro da minha plataforma foi para lá.

Você faz:
  1. Me lembrar de fazer UMA COMPRA DE TESTE REAL (pode ser um produto barato comprado
     por mim), acessando a landing page por um link COM utm_content.
  2. Depois da compra, verificar NO BANCO e me mostrar:
     - a linha em purchases foi criada?
     - ⚠️ O VALOR ESTÁ CORRETO? Se a minha plataforma for a Kiwify, o código assume
       centavos e divide por 100 — se sair 100× errado, corrija amountInCents no
       registro. Nas demais o valor é usado como veio.
     - o status interno está `approved`?
     - ⚠️ O ad_id FOI PREENCHIDO, e bate com o ID real do anúncio no Gerenciador? Este
       é o ponto de falha mais provável de toda a instalação.
     - utm_source/medium/campaign/content vieram?
     - geo_country/geo_region vieram? (se a plataforma não mandar endereço, ficam
       nulos — me avise, não é erro)
     - match vai dizer `none` — ESPERADO sem captura própria.
  3. ⚠️ Abrir o raw_webhook e comparar os caminhos reais com o que o registro espera.
     Se algum campo veio de outro caminho, ajuste a entrada da minha plataforma em
     src/lib/checkout/platforms.ts:
       a) acrescente o caminho real aos candidatos do campo que falhou;
       b) mantenha a validação numérica do ad_id (^\d{5,25}$) — não afrouxe isso;
       c) preserve a ordem de precedência (campos nativos → utm.content → pipe →
          visitante);
       d) quando tudo bater, vire confirmed: true, fixe amountInCents e remova as
          ressalvas já resolvidas;
       e) NÃO crie rota nova — a rota é única e genérica.
     Mostre o diff e explique antes de aplicar.
  4. Testar idempotência: reenviar o mesmo webhook e confirmar que NÃO duplica linha.
  5. Testar segurança: enviar com segredo/assinatura errada e confirmar 401 + nada
     gravado.
  6. Confirmar na página Campanhas que a venda apareceu no anúncio certo, no modo de
     atribuição "Last Click".

---

ETAPA 6 — CONFERIR A ORIGEM DO ad_id PONTA A PONTA

🧑 Eu vou configurar utm_content={{ad.id}} na URL dos meus anúncios na Meta.

Você faz:
  1. Me explicar onde colocar isso no Gerenciador (campo "Parâmetros de URL" no nível
     do ANÚNCIO) e por que tem que ser {{ad.id}} e não o nome da campanha — o
     cruzamento é sempre por ID exato.
  2. Me dar um teste manual sem gastar em anúncio: montar na mão uma URL com
     ?utm_content=<id real de um anúncio meu>, abrir, ir até o checkout e conferir que
     o parâmetro chegou.
  3. Se não estiver chegando, me ajudar a diagnosticar o MEU código externo: ele precisa
     ler utm_content da URL, guardar (localStorage/cookie, para sobreviver à navegação
     interna) e anexar ao link do checkout no clique. Não proponha trocar isso pelo
     snippet do projeto.
  4. Me lembrar de que venda sem ad_id ainda é gravada — entra como orgânico.

---

ETAPA 7 — DEPLOY NA VERCEL

Você faz:
  1. Me guiar para criar um repositório no GitHub e fazer o push.
  2. Me guiar no import na Vercel.
  3. Listar as 6 variáveis de ambiente e confirmar que NENHUMA com valor sensível está
     com prefixo NEXT_PUBLIC_. A ENCRYPTION_KEY tem que ser A MESMA do .env.local,
     senão os segredos já cifrados no banco não abrem.
  4. Depois do deploy, verificar: o site responde e /login abre; em Settings → Cron
     Jobs aparecem /api/cron/rules e /api/cron/cleanup; /setup mostra "Setup já
     concluído".
  5. ⚠️ Me lembrar de ATUALIZAR A URL DE WEBHOOK na minha plataforma para o domínio de
     produção — ela ainda aponta para o ambiente de teste.
  6. Refazer uma compra de teste em produção, com utm_content na URL, e confirmar que
     chega com o ad_id preenchido.

---

ETAPA 8 — FECHAMENTO

Você faz:
  1. Percorrer comigo o checklist do SECURITY.md, item por item.
  2. Confirmar que o cadastro público segue DESLIGADO no Supabase.
  3. Me mostrar um resumo final: o que funciona com evidência, o que não foi testado e
     qualquer risco residual.
  4. Se alterou código (o registro de plataformas, por exemplo), fazer commit e
     atualizar CLAUDE.md com o que a venda real confirmou — incluindo em qual caminho do
     payload o ad_id realmente chega na minha plataforma.

Comece pela ETAPA 0.
````

---

## Resumo dos passos manuais (🧑)

| Onde | O que fazer |
|---|---|
| **Decisão** | Escolher a(s) plataforma(s) de checkout |
| Supabase | Criar projeto; copiar URL + chaves; **desligar cadastro público** |
| `.env.local` | Preencher as 6 variáveis |
| Schema | Colar `supabase/setup.sql` no SQL Editor **ou** `npx supabase db push` |
| `/setup` | Criar o primeiro acesso e a primeira área |
| Meta Business | System User + conta vinculada + token `ads_read`/`ads_management` |
| Anúncios da Meta | `utm_content={{ad.id}}` no campo "Parâmetros de URL" |
| **Seu código externo** | Levar o `ad_id` ao checkout (Hotmart: `xcod`; demais: `utm_content`) |
| Plataforma de checkout | Cadastrar a URL de webhook copiada do painel |
| Painel → Integrações | Conectar a Meta (por token) e salvar o segredo do checkout |
| Vercel | Importar repo e cadastrar as 6 variáveis |
| Depois do deploy | **Trocar a URL de webhook para produção** |

Não está na lista, de propósito: instalar snippet, cadastrar origens CORS e digitar o
`act_<id>` da conta de anúncios.

---

## Apêndice — estado de cada plataforma

**Confirmadas contra um payload real** (`confirmed: true`): Hotmart, Kiwify, Kirvano,
Perfect Pay. **Parciais** (`confirmed: false`): Ticto, Cakto, Greenn — a interface avisa
o ponto em aberto de cada uma.

Comportamento do **valor** (o de maior risco), por plataforma:

- **Kiwify** e **Ticto**: vêm em **centavos** — o painel divide por 100. Confirmado
  (Kiwify `charge_amount 47832` = R$ 478,32; Ticto `producer.amount 11052` = `cms 110.52`).
- **Hotmart, Kirvano, Perfect Pay, Cakto, Greenn**: em **reais**, usados como vieram.
  A Kirvano manda formatado (`"R$ 169,80"`) e o parser de moeda entende.

O que falta em cada parcial: **Ticto** — o ad_id (o exemplo veio com o rastreio em
branco, `"Não Informado"`); **Cakto** — o envelope do webhook (o exemplo era uma lista
de API); **Greenn** — o header de autenticação. Nada disso perde venda: o `raw_webhook`
fica salvo.

**Como confirmar:**

1. Faça uma venda de teste real.
2. Se o webhook devolver 401, olhe o log do servidor — ele lista os **nomes** dos
   headers que chegaram (nunca os valores). Ajuste `auth.headers` no registro.
3. Abra o `raw_webhook` salvo e compare com os caminhos declarados.
4. Corrija os candidatos, vire `confirmed: true`, fixe `amountInCents` e apague as
   ressalvas resolvidas.

Tudo isso vive num arquivo só:
[`src/lib/checkout/platforms.ts`](../src/lib/checkout/platforms.ts).
