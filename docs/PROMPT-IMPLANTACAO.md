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

## Antes de começar — o que você precisa ter

| Item | Para quê | Custo |
|---|---|---|
| Conta no [Supabase](https://supabase.com) | Banco, autenticação e realtime | Plano free serve |
| Conta na [Vercel](https://vercel.com) | Deploy | Plano free serve |
| Conta no GitHub | Origem do deploy | — |
| [Meta Business Manager](https://business.facebook.com) | Token de leitura dos anúncios | — |
| Conta Hotmart e/ou Kiwify | Webhooks de compra | — |
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

ETAPA 4 — INTEGRAÇÕES

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
  4. Me guiar para cadastrar as origens permitidas (CORS) com os domínios das minhas
     landing pages. Explicar que, sem isso, a captura é bloqueada de propósito.

---

ETAPA 5 — WEBHOOKS E VALIDAÇÃO COM VENDA REAL  ⚠️ ETAPA MAIS IMPORTANTE

Contexto: as docs oficiais da Hotmart e da Kiwify não puderam ser lidas durante o
desenvolvimento, então os campos dos payloads foram inferidos e implementados de forma
defensiva. Esta etapa existe para confirmar tudo com dado real.

🧑 Eu vou cadastrar as URLs de webhook:
  - Hotmart: Ferramentas → Webhook → colar a URL que o painel mostra em Integrações
  - Kiwify: Apps → Webhooks → colar a URL e marcar os eventos de compra
  - depois, copiar o hottok (Hotmart) e o token de assinatura (Kiwify) e salvar no
    painel, em Integrações

Você faz:
  1. Me lembrar de fazer UMA COMPRA DE TESTE REAL em cada plataforma que eu for usar
     (pode ser um produto de R$ 5 comprado por mim mesmo).
  2. Depois de cada compra, verificar NO BANCO e me mostrar:
     - a linha em purchases foi criada?
     - ⚠️ O VALOR ESTÁ CORRETO? Este é o maior risco conhecido: para a Kiwify o código
       assume que charge_amount vem em CENTAVOS e divide por 100. Se o valor gravado
       estiver 100x maior ou menor que a venda real, corrija normalizeAmount() em
       src/app/api/webhook/kiwify/route.ts.
     - o status interno está certo (approved)?
     - o campo match diz como casou o visitante (user_id, email ou telefone)?
     - o ad_id foi preenchido (se a visita veio de anúncio)?
  3. Abrir o raw_webhook salvo e comparar os caminhos dos campos com o que o parser
     espera. Se algum campo estiver vindo de outro caminho, ajuste os arrays de
     candidatos em src/app/api/webhook/*/route.ts.
  4. Confirmar os 3 pontos que ficaram em aberto (estão listados no SECURITY.md):
     - a Kiwify manda o rastreio em "sck" ou em "s1"?
     - o valor vem mesmo em centavos?
     - a assinatura HMAC é sha1 ou sha256?
     Depois de confirmar, ENXUGUE o código para aceitar só o formato real e me explique
     o que mudou.
  5. Testar a idempotência: reenviar o mesmo webhook e confirmar que NÃO cria linha
     duplicada em purchases.
  6. Testar a segurança: enviar um webhook com assinatura/hottok errado e confirmar
     que a resposta é 401 e que nada foi gravado.

---

ETAPA 6 — CAPTURA NAS LANDING PAGES

🧑 Eu vou colar o snippet (copiado em Integrações) antes do </body> das minhas landing
pages, e configurar utm_content={{ad.id}} na URL dos meus anúncios na Meta.

Você faz:
  1. Me explicar onde exatamente colar e como conferir se carregou (aba Network do
     navegador, procurar por track.js e pelas chamadas a /api/identify e /api/event).
  2. Depois que eu acessar minha landing page com um parâmetro de teste
     (?utm_content=123456789012345), verificar no banco:
     - foi criada linha em visitors com o user_id e o utm_content?
     - foi criado o evento page_view em events_log?
  3. Me pedir para clicar num botão de checkout e confirmar que:
     - o evento initiate_checkout foi gravado;
     - o link do checkout foi decorado com sck (user_id) e src/utm_content (ad_id).
  4. Se a captura for bloqueada por CORS, me mostrar o erro do console e confirmar que
     o domínio está cadastrado nas origens permitidas.

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
  5. ⚠️ Me lembrar de ATUALIZAR AS URLS DE WEBHOOK na Hotmart e na Kiwify para o
     domínio de produção (elas ainda apontam para o ambiente de teste), e de atualizar
     o snippet nas landing pages para o domínio de produção.
  6. Refazer uma compra de teste em produção e confirmar que ela chega.

---

ETAPA 8 — FECHAMENTO

Você faz:
  1. Percorrer comigo o checklist do SECURITY.md, item por item, confirmando cada um.
  2. Confirmar especialmente que o cadastro público está DESLIGADO no Supabase.
  3. Me mostrar um resumo final: o que está funcionando com evidência, o que não foi
     testado e qualquer risco residual.
  4. Se você alterou código durante a implantação (parsers de webhook, por exemplo),
     fazer commit e atualizar o CLAUDE.md com o que foi confirmado.

Comece pela ETAPA 1.
````

---

## Resumo dos passos manuais (🧑)

Se preferir fazer sem agente nenhum, estes são os pontos em que **só você** pode agir:

| Onde | O que fazer |
|---|---|
| Supabase | Criar projeto; copiar URL + chaves; **desligar cadastro público** |
| `.env.local` | Preencher as 6 variáveis |
| Meta Business | Criar System User, vincular a conta de anúncios, gerar token com `ads_read` + `ads_management` |
| Painel → Integrações | Adicionar a conta Meta, cadastrar origens CORS, salvar hottok e token da Kiwify |
| Hotmart / Kiwify | Cadastrar as URLs de webhook (copiadas do painel) |
| Landing pages | Colar o snippet antes de `</body>` |
| Anúncios da Meta | Usar `utm_content={{ad.id}}` na URL |
| Vercel | Importar repo e cadastrar as 6 variáveis |
| Depois do deploy | **Trocar as URLs de webhook e o snippet para o domínio de produção** |

---

## Os 3 pontos que a implantação precisa confirmar

Registrados também no [`SECURITY.md`](../SECURITY.md). Não foi possível validá-los
contra as docs oficiais (páginas renderizadas por JS), então o código aceita as duas
possibilidades em cada caso:

1. **Valor da Kiwify em centavos** — `charge_amount` inteiro é dividido por 100.
   **Maior risco:** se estiver errado, os valores saem 100× errados.
2. **Kiwify `sck` vs `s1`** — o código lê os dois; o snippet envia os dois.
3. **HMAC da Kiwify: sha1 ou sha256** — o código aceita ambos.

Depois de confirmar com uma venda real, vale enxugar o código para aceitar só o formato
correto.
