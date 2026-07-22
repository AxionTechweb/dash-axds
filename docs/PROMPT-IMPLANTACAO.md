# Prompt de implantação — do zero até funcionando

Este documento tem duas partes:

1. **O prompt** — copie e cole num agente de código (Claude Code, Cursor, etc.) aberto
   na pasta do projeto. Ele conduz a implantação e valida cada etapa.
2. **Os passos manuais** — o que **só você** pode fazer (criar contas, gerar tokens,
   cadastrar webhooks nas plataformas). Estão marcados com 🧑 e o agente vai parar e
   pedir quando chegar a hora.

> ⚠️ **Leia antes de começar:** este projeto foi construído e validado por build, tipos,
> lint e testes de lógica pura — mas **nunca rodou contra um banco, uma API da Meta ou um
> webhook reais**. A Etapa 5 (testes com venda real) não é opcional: é ela que valida a
> integração de verdade. Não aponte tráfego pago antes de concluí-la.

---

## Como a atribuição funciona nesta instalação

**Não há snippet nas landing pages.** Quem carrega as UTMs até o checkout é o seu
**código de rastreio externo**. O caminho é:

```
Anúncio na Meta            →  utm_content={{ad.id}} na URL
Seu código externo         →  propaga para o link do checkout
   Hotmart  → parâmetro src
   Kiwify   → parâmetro utm_content
Webhook da plataforma      →  devolve o parâmetro para este painel
Painel                     →  grava em purchases.ad_id e cruza com a Meta por ID exato
```

O painel lê as UTMs e o endereço do comprador **direto do payload do webhook**. Não
depende de nada instalado no seu site.

**O que isso implica:**

| Funciona sem snippet | Fica vazio sem snippet |
|---|---|
| Faturamento, lucro, ROAS, CPA | Checkouts iniciados |
| Vendas por anúncio / campanha / conjunto | Funil (views → checkouts) |
| Gasto, impressões, CPM, CTR, CPC (Meta) | Page views e a aba Eventos |
| UTMs e produto de cada venda | — |
| Regiões (se a plataforma mandar o endereço) | — |
| Regras, financeiro, vendas em tempo real | — |

Se algum dia quiser essas métricas, o snippet continua disponível em
**Integrações → Captura própria (opcional)**. Ele não é necessário para a atribuição.

---

## Antes de começar — o que você precisa ter

| Item | Para quê | Custo |
|---|---|---|
| Conta no [Supabase](https://supabase.com) | Banco, autenticação e realtime | Plano free serve |
| Conta na [Vercel](https://vercel.com) | Deploy | Plano free serve |
| Conta no GitHub | Origem do deploy | — |
| [Meta Business Manager](https://business.facebook.com) | Token de leitura dos anúncios | — |
| **Hotmart e/ou Kiwify** | Webhooks de compra — você escolhe na Etapa 0 | — |
| Seu código de rastreio | Levar as UTMs até o checkout | — |
| Node.js 20.9+ instalado | Rodar local | — |

---

## O PROMPT (copie tudo abaixo)

````text
Você é meu parceiro de implantação. O projeto nesta pasta é um painel de tracking e
atribuição (Next.js 16 + Supabase), já construído em 9 fases. Leia o CLAUDE.md e o
SECURITY.md antes de começar.

Seu objetivo: colocar este painel funcionando de verdade, validando cada etapa com
evidência real (query no banco, resposta HTTP, linha gravada) — nunca declare que algo
funciona sem ter verificado.

CONTEXTO IMPORTANTE DA MINHA INSTALAÇÃO:
- NÃO vou instalar o snippet de captura nas minhas landing pages.
- Um código de rastreio EXTERNO, que já roda no meu site, leva as UTMs até o link do
  checkout (src na Hotmart, utm_content na Kiwify).
- Portanto a atribuição depende 100% do que chega no PAYLOAD DO WEBHOOK. É lá que o
  painel lê o ad_id, as UTMs e o endereço do comprador.
- Não me proponha instalar o snippet como solução para nada. Se alguma métrica
  depender dele (checkouts iniciados, funil, page views), apenas me avise que ela vai
  ficar zerada e siga em frente.

REGRAS:
- Trabalhe uma ETAPA por vez. Ao fim de cada uma, me mostre o que verificou e espere
  meu OK antes de seguir.
- Quando precisar de algo que só eu posso fazer (marcado com 🧑), PARE e me dê
  instruções exatas, incluindo onde clicar.
- NUNCA me peça para colar segredos no chat. Peça para eu escrever direto no arquivo
  .env.local ou no painel da Vercel.
- Se algo falhar, me mostre o erro real e a causa provável antes de tentar corrigir.
- Não contorne autenticação nem desligue RLS "para testar". Se algo bloquear, o
  bloqueio provavelmente está certo — investigue a causa.

---

ETAPA 0 — QUAL CHECKOUT EU VOU USAR

Antes de qualquer outra coisa, ME PERGUNTE qual plataforma de checkout eu uso e espere
a resposta:

  ( ) Só Hotmart
  ( ) Só Kiwify
  ( ) As duas

Depois que eu responder:
  1. Anote a escolha e trate as etapas seguintes só para a(s) plataforma(s) escolhida(s).
     Não me peça token, webhook nem venda de teste da plataforma que eu não uso.
  2. Me diga, com base na minha escolha, qual parâmetro o meu código externo precisa
     colocar no link do checkout para carregar o ad_id:
       - Hotmart: src=<ad_id>       (parâmetro nativo da Hotmart)
       - Kiwify:  utm_content=<ad_id>
     E qual é o valor esperado: o {{ad.id}} da Meta, ou seja, SÓ DÍGITOS. O painel
     descarta qualquer coisa que não seja numérica (5 a 25 dígitos).
  3. ⚠️ Se eu escolhi Kiwify (sozinha ou junto), me avise agora que existem 3 pontos do
     parser da Kiwify que só uma venda real confirma, e que o de maior impacto é o
     valor em centavos (risco de gravar 100x errado). Estão detalhados na ETAPA 5.

---

ETAPA 1 — BANCO DE DADOS

🧑 Eu vou:
  a) Criar um projeto novo em supabase.com (anote a região mais próxima).
  b) Em Project Settings → API, copiar: URL do projeto, chave anon/publishable e
     chave service_role/secret.
  c) Em Authentication → Providers → Email, DESMARCAR "Allow new users to sign up".
     (Passo crítico de segurança: sem isso, qualquer pessoa cria conta no painel.)
  d) Em Project Settings → General, copiar o Reference ID do projeto.

Você faz:
  1. Rodar `npm install`.
  2. Criar o .env.local a partir do .env.example e me dizer exatamente quais linhas
     eu devo preencher e com quais valores.
     - Para ENCRYPTION_KEY, SETUP_TOKEN e CRON_SECRET, gere valores aleatórios fortes
       para mim (ex.: `openssl rand -base64 48`) e explique que a ENCRYPTION_KEY, se
       perdida, torna os segredos do banco irrecuperáveis.
  3. Depois que eu confirmar que preenchi: rodar `npx supabase link --project-ref <REF>`
     e `npx supabase db push`.
  4. VALIDAR de verdade, e me mostrar a saída:
     - todas as tabelas foram criadas;
     - RLS está habilitada em todas elas;
     - as funções app_encrypt, app_decrypt, identify_visitor, log_event,
       rate_limit_hit e rate_limit_cleanup existem;
     - a tabela branding tem exatamente 1 linha.

---

ETAPA 2 — SUBIR LOCAL E CRIAR O PRIMEIRO ACESSO

Você faz:
  1. `npm run dev`.
  2. Confirmar que /login responde 200 e que /dashboard redireciona para /login
     (isso prova que a proteção de rotas está ativa).
  3. Me instruir a acessar http://localhost:3000/setup e preencher o SETUP_TOKEN,
     meu e-mail, minha senha e o nome da primeira área.
  4. Depois que eu criar: confirmar no banco que existe 1 usuário, 1 área e 1 linha
     em settings. Confirmar também que /setup agora mostra "Setup já concluído".
  5. Me instruir a fazer login e confirmar que o painel abre.

---

ETAPA 3 — DADOS DE EXEMPLO (para eu ver a interface funcionando)

Você faz:
  1. Rodar `node scripts/seed.mjs`.
  2. Me pedir para abrir o Dashboard, Campanhas, Vendas e Financeiro e confirmar que
     os números aparecem.
  3. Testar o feed em tempo real: inserir uma compra aprovada direto no banco e
     confirmar que ela aparece no Dashboard sem eu recarregar a página. Se o Realtime
     não funcionar, investigue a publicação supabase_realtime.
  4. Ao fim, rodar `node scripts/seed.mjs --clear` e confirmar que os dados de exemplo
     sumiram (não quero dado fictício misturado com dado real).

---

ETAPA 4 — CONTA DE ANÚNCIOS DA META

🧑 Eu vou gerar o token da Meta. Me dê o passo a passo exato:
  - em business.facebook.com → Configurações do negócio → Usuários → Usuários do sistema
  - criar um usuário do sistema com função de admin
  - Adicionar ativos → vincular a CONTA DE ANÚNCIOS com permissão total
  - Gerar novo token → selecionar o app → marcar os escopos ads_read E ads_management
  - copiar o token (ele não expira)
  - copiar também o ID da conta de anúncios (formato act_1234567890)

Você faz:
  1. Me guiar no painel: Integrações → Adicionar conta → preencher rótulo, ID e token
     → clicar em "Testar conexão" ANTES de salvar.
  2. Se o teste falhar, interpretar o erro para mim (token errado, escopo faltando ou
     conta não vinculada) e dizer o que corrigir.
  3. Depois de salvo, confirmar que a página Campanhas carrega dados reais da Meta.
     Se vier vazia, verificar se há campanhas no período selecionado.
  4. NÃO me peça para cadastrar origens permitidas (CORS): elas só valem para a captura
     própria, que eu não vou usar. Deixe a lista vazia mesmo.

---

ETAPA 5 — WEBHOOK E VALIDAÇÃO COM VENDA REAL  ⚠️ ETAPA MAIS IMPORTANTE

Faça esta etapa APENAS para a(s) plataforma(s) que eu escolhi na ETAPA 0.

Contexto: as docs oficiais da Hotmart e da Kiwify não puderam ser lidas durante o
desenvolvimento, então os campos dos payloads foram inferidos e implementados de forma
defensiva. Como não há captura própria, este payload é a ÚNICA fonte de atribuição —
por isso esta etapa é a mais crítica de todas.

🧑 Eu vou cadastrar a URL de webhook da minha plataforma:
  - Hotmart: Ferramentas → Webhook → colar a URL que o painel mostra em Integrações
  - Kiwify: Apps → Webhooks → colar a URL e marcar os eventos de compra
  - depois, copiar o hottok (Hotmart) ou o token de assinatura (Kiwify) e salvar no
    painel, em Integrações

🧑 Eu também vou garantir que meu código externo está colocando o ad_id no link do
checkout (src na Hotmart, utm_content na Kiwify). Me diga como conferir isso ANTES da
compra: abrir a landing page com ?utm_content=999999999999 e inspecionar o link do
botão de checkout, confirmando que o parâmetro foi para lá.

Você faz:
  1. Me lembrar de fazer UMA COMPRA DE TESTE REAL (pode ser um produto de R$ 5 comprado
     por mim mesmo), acessando a landing page por um link COM utm_content — assim o
     ad_id percorre o caminho inteiro.
  2. Depois da compra, verificar NO BANCO e me mostrar:
     - a linha em purchases foi criada?
     - ⚠️ O VALOR ESTÁ CORRETO? Este é o maior risco conhecido: para a Kiwify o código
       assume que charge_amount vem em CENTAVOS e divide por 100. Se o valor gravado
       estiver 100x maior ou menor que a venda real, corrija normalizeAmount() em
       src/app/api/webhook/kiwify/route.ts.
     - o status interno está certo (approved)?
     - ⚠️ O ad_id FOI PREENCHIDO? Sem snippet, este é o ponto de falha mais provável de
       toda a instalação. Se vier nulo, abra o raw_webhook e descubra em qual caminho o
       parâmetro realmente chegou; depois ajuste os candidatos no parser.
     - as colunas utm_source / utm_medium / utm_campaign / utm_content foram
       preenchidas a partir do webhook?
     - geo_country / geo_region vieram? (Alimentam a tela de regiões. Se a plataforma
       não mandar endereço, ficam nulos — me avise, não é erro.)
     - o campo match vai dizer "none", e isso é ESPERADO sem captura própria: não existe
       visitante para casar. A atribuição não depende disso.
  3. Abrir o raw_webhook salvo e comparar os caminhos dos campos com o que o parser
     espera. Se algum campo estiver vindo de outro caminho, ajuste os arrays de
     candidatos em src/app/api/webhook/<plataforma>/route.ts.
  4. Se eu uso Kiwify, confirmar os 3 pontos em aberto (listados no SECURITY.md):
     - a Kiwify manda o rastreio em "sck" ou em "s1"?
     - o valor vem mesmo em centavos?
     - a assinatura HMAC é sha1 ou sha256?
     Depois de confirmar, ENXUGUE o código para aceitar só o formato real e me explique
     o que mudou.
  5. Testar a idempotência: reenviar o mesmo webhook e confirmar que NÃO cria linha
     duplicada em purchases.
  6. Testar a segurança: enviar um webhook com assinatura/hottok errado e confirmar
     que a resposta é 401 e que nada foi gravado.
  7. Confirmar na página Campanhas que a venda apareceu no anúncio certo, no modo de
     atribuição "Last Click".

---

ETAPA 6 — CONFERIR A ORIGEM DO ad_id PONTA A PONTA

Esta etapa existe porque, sem snippet, o elo mais frágil é o trecho que NÃO está neste
projeto: o código externo que leva o parâmetro até o checkout.

🧑 Eu vou configurar utm_content={{ad.id}} na URL dos meus anúncios na Meta.

Você faz:
  1. Me explicar exatamente onde colocar isso no Gerenciador de Anúncios (campo
     "Parâmetros de URL" no nível do anúncio) e por que tem que ser {{ad.id}} e não o
     nome da campanha — o cruzamento com a Meta é sempre por ID exato.
  2. Me dar um teste manual para rodar sem gastar em anúncio: montar na mão uma URL
     com ?utm_content=<id real de um anúncio meu>, abrir, ir até o checkout e conferir
     que o parâmetro chegou no link.
  3. Se o parâmetro NÃO estiver chegando ao checkout, me ajudar a diagnosticar o meu
     código externo: ele precisa ler utm_content da URL da landing page, guardar
     (localStorage ou cookie, para sobreviver à navegação interna) e anexar ao link do
     checkout no momento do clique. Não proponha trocar isso pelo snippet do projeto —
     apenas me ajude a apontar onde o meu código falha.
  4. Depois de confirmado, me lembrar de que qualquer venda sem ad_id ainda é gravada
     normalmente, só entra como orgânico/direto.

---

ETAPA 7 — DEPLOY NA VERCEL

Você faz:
  1. Me guiar para criar um repositório no GitHub e fazer o push.
  2. Me guiar no import do projeto na Vercel.
  3. Listar as 6 variáveis de ambiente que preciso cadastrar lá (as mesmas do
     .env.local) e confirmar que NENHUMA delas com valor sensível está com o prefixo
     NEXT_PUBLIC_.
  4. Depois do deploy, verificar:
     - o site responde e /login abre;
     - em Settings → Cron Jobs aparecem /api/cron/rules e /api/cron/cleanup;
     - /setup mostra "Setup já concluído" (a rota se desativou sozinha).
  5. ⚠️ Me lembrar de ATUALIZAR A URL DE WEBHOOK na minha plataforma para o domínio de
     produção — ela ainda aponta para o ambiente de teste.
  6. Refazer uma compra de teste em produção, com utm_content na URL, e confirmar que
     ela chega com o ad_id preenchido.

---

ETAPA 8 — FECHAMENTO

Você faz:
  1. Percorrer comigo o checklist do SECURITY.md, item por item, confirmando cada um.
  2. Confirmar especialmente que o cadastro público está DESLIGADO no Supabase.
  3. Me mostrar um resumo final: o que está funcionando com evidência, o que não foi
     testado e qualquer risco residual.
  4. Se você alterou código durante a implantação (parsers de webhook, por exemplo),
     fazer commit e atualizar o CLAUDE.md com o que foi confirmado — incluindo qual
     checkout esta instância usa e em qual caminho do payload o ad_id realmente chega.

Comece pela ETAPA 0.
````

---

## Resumo dos passos manuais (🧑)

Se preferir fazer sem agente nenhum, estes são os pontos em que **só você** pode agir:

| Onde | O que fazer |
|---|---|
| **Decisão** | Escolher o checkout: Hotmart, Kiwify ou os dois |
| Supabase | Criar projeto; copiar URL + chaves; **desligar cadastro público** |
| `.env.local` | Preencher as 6 variáveis |
| Meta Business | Criar System User, vincular a conta de anúncios, gerar token com `ads_read` + `ads_management` |
| Anúncios da Meta | Usar `utm_content={{ad.id}}` na URL |
| **Seu código externo** | Levar o `ad_id` até o link do checkout: `src` (Hotmart) ou `utm_content` (Kiwify) |
| Hotmart / Kiwify | Cadastrar a URL de webhook (copiada do painel) |
| Painel → Integrações | Adicionar a conta Meta e salvar o hottok / token da Kiwify |
| Vercel | Importar repo e cadastrar as 6 variáveis |
| Depois do deploy | **Trocar a URL de webhook para o domínio de produção** |

Não está na lista, de propósito: instalar snippet e cadastrar origens CORS. Só fazem
falta para quem quiser a captura própria.

---

## Os pontos que a implantação precisa confirmar

Registrados também no [`SECURITY.md`](../SECURITY.md).

**Vale para qualquer plataforma:**

- **Em qual caminho do payload o `ad_id` chega.** Sem captura própria, é a única fonte
  de atribuição. O parser tenta vários caminhos; o `raw_webhook` fica salvo para você
  conferir e ajustar.

**Só para a Kiwify** — não foi possível validar contra a doc oficial (página renderizada
por JS), então o código aceita as duas possibilidades em cada caso:

1. **Valor em centavos** — `charge_amount` inteiro é dividido por 100.
   **Maior risco:** se estiver errado, os valores saem 100× errados.
2. **`sck` vs `s1`** — o código lê os dois.
3. **HMAC: sha1 ou sha256** — o código aceita ambos.

Depois de confirmar com uma venda real, vale enxugar o código para aceitar só o formato
correto.
