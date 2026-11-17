# Migração do painel para Cloudflare (Workers + D1) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar o painel da Vercel + Supabase e rodar 100% na Cloudflare (Workers + D1), sem perder dado e sem derrubar produção na virada.

**Architecture:** O Next.js 16 continua o mesmo, empacotado com `@opennextjs/cloudflare` e rodando num Worker. O banco vira D1 (SQLite), acessado por Drizzle ORM. O login vira better-auth (no D1), com as senhas atuais migradas (hash bcrypt). Os crons viram Cron Triggers do próprio Worker. Todo o trabalho fica no branch `cloudflare` até a virada: o `main` (Vercel + Supabase) segue em produção e o DW1 continua commitando nele.

**Tech Stack:** Next.js 16.2 · @opennextjs/cloudflare · wrangler · Cloudflare D1 · drizzle-orm (d1) + drizzle-kit · better-auth (+ plugin admin) · bcryptjs · vitest + @cloudflare/vitest-pool-workers · WebCrypto (AES-GCM).

**Spec:** decisões tomadas na conversa de 13/11/2026 (caminho 1: tudo na Cloudflare) + `CLAUDE.md` do repo (regras de arquitetura que continuam valendo) + levantamento de 06/11 em `obsidian-vault/Axds/Axds - Mapa de Manutencao (HUB).md`.

## Global Constraints

- Plano **Workers Paid (US$ 5/mês)** obrigatório: o Free tem 10 ms de CPU por request (o Next não roda) e só 5 Cron Triggers (precisamos de 8).
- Bundle do Worker ≤ **10 MB comprimido** (limite do Paid).
- Continua valendo do `CLAUDE.md`: zero hardcode, sem CAPI/Measurement Protocol, segredos de integração **cifrados** no banco com a chave só no env, rate limit **no banco** (nunca em memória), webhooks autenticados pelo mecanismo nativo e em tempo constante, `ad_id` só numérico `^\d{5,25}$`, UPSERT idempotente por `transaction_id`, `raw_webhook` sempre salvo.
- Status de compra continua `approved | pending | refunded | chargeback | canceled`, e as 8 plataformas de `PLATFORM_IDS` continuam espelhadas no CHECK de `purchases.plataforma`.
- Datas no D1 guardadas como **TEXT ISO-8601 UTC** (`2026-11-13T21:00:00.000Z`), para que `gte/lte/order` continuem comparando como texto na mesma ordem.
- Dinheiro (`numeric` hoje) vira **REAL**. Nenhuma conta muda de unidade: reais continuam reais.
- `jsonb` vira TEXT com `mode: "json"` do Drizzle. `uuid` vira TEXT com default `crypto.randomUUID()`. `boolean` vira INTEGER `mode: "boolean"`.
- Nada de Meta/WhatsApp real em teste: disparo só para 5511952134563, campanha só PAUSADA.
- Nenhum deploy do `main` para a Vercel muda de framework. O repo Vite antigo `dash-axion` continua proibido.
- Bindings: D1 `DB`. Env (secrets do wrangler): `ENCRYPTION_KEY`, `LEGACY_ENCRYPTION_KEY` (só na importação), `SETUP_TOKEN`, `CRON_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `EMAIL_API_KEY`, `EMAIL_FROM`, `VAPID_*` e `LEGAL_*` existentes.

## Decisões em aberto (resolver antes da task indicada)

1. **Conta Cloudflare** onde o Worker e o D1 vão ficar (Axion ou Fabrício) → antes da Task 1.
2. **Provedor de e-mail** para reset de senha e convite. Hoje o SMTP fica no Supabase. Sugestão: Resend via `fetch` → antes da Task 4.
3. **Domínio final**: `*.workers.dev`, domínio próprio da Axion na Cloudflare, ou manter `dash-axion.vercel.app` como proxy → antes da Task 11.

## Review Focus

1. **Login de usuário que já existe**: quem entrava com a senha antiga entra com a mesma senha no Worker, sem reset → teste `verifica senha com hash bcrypt importado do Supabase` (Task 4).
2. **Segredos cifrados na virada**: token da Meta, hottok, chave PayT etc. decifram no Worker depois da importação. Um ciphertext pgcrypto não abre com AES-GCM → teste `reimporta segredo pgcrypto e decifra com AES-GCM` (Task 10).
3. **Venda chegando durante a virada**: webhook que cai no meio da janela não pode se perder nem duplicar → teste `upsert por transaction_id é idempotente com payload repetido` (Task 6) + passo de reenvio no runbook (Task 11).
4. **Filtro por período**: datas TEXT com fuso errado mudam o total do dia → teste `getPurchases filtra o dia em UTC igual ao Postgres` (Task 5).
5. **Cron que falha calado**: Cron Trigger sem `CRON_SECRET` ou com path errado não roda o disparo → teste `scheduled chama a rota certa por expressão cron com Bearer` (Task 8).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `wrangler.jsonc` | Worker, binding D1 `DB`, `triggers.crons`, `compatibility_flags: ["nodejs_compat"]` |
| `open-next.config.ts` | config do OpenNext |
| `worker.ts` | entrada do Worker: repassa `fetch` pro OpenNext e implementa `scheduled` |
| `src/db/schema/*.ts` | schema Drizzle, um arquivo por domínio (`core`, `sales`, `meta`, `whatsapp`, `integrations`, `ops`, `auth`) |
| `src/db/client.ts` | `getDb(): DrizzleD1Database<typeof schema>` via `getCloudflareContext()` |
| `drizzle/` | migrations SQL geradas pelo drizzle-kit (substituem `supabase/migrations` neste branch) |
| `src/lib/crypto.ts` | reescrito: AES-GCM com WebCrypto |
| `src/lib/auth/server.ts` | instância better-auth |
| `src/lib/auth/session.ts` | `requireUser()` / `getUser()` usados nas páginas, actions e `proxy.ts` |
| `src/lib/rpc/*.ts` | `rateLimitHit`, `rateLimitCleanup`, `identifyVisitor`, `logEvent` em TS |
| `scripts/migrate-from-supabase.ts` | export Supabase → import D1 (dados, usuários e segredos recifrados) |
| `tests/**` | vitest no pool de Workers (D1 de verdade via miniflare) |

---

### Task 1: Spike — o painel atual builda e roda num Worker

Antes de reescrever o banco, provar que o Next 16 + `googleapis` + `web-push` cabem e rodam no Worker. Se falhar, o plano para aqui e volta pra decisão.

**Files:**
- Create: `wrangler.jsonc`, `open-next.config.ts`, `.dev.vars.example`
- Modify: `package.json` (scripts `cf:build`, `cf:preview`, `cf:deploy`), `next.config.ts` (`initOpenNextCloudflareForDev()`), `.gitignore` (`.open-next`, `.wrangler`, `.dev.vars`)

**Interfaces:**
- Produces: `npm run cf:build`, `npm run cf:preview`, `npm run cf:deploy`.

- [x] **Step 1:** `git checkout -b cloudflare` a partir do `main` atualizado.
- [x] **Step 2:** Instalar `@opennextjs/cloudflare` e `wrangler` e criar o `wrangler.jsonc` com `nodejs_compat` e `compatibility_date` atual. Por enquanto, ainda apontando pro Supabase via env.
- [x] **Step 3:** Rodar `npm run cf:build`. Esperado: build ok. Anotar o tamanho com `wrangler deploy --dry-run --outdir .wrangler/dry` e conferir se fica abaixo de 10 MB comprimido.
- [ ] **Step 4:** Rodar `npm run cf:preview` e abrir `/login`, `/dashboard` e `/campanhas` logado. Esperado: renderizam com os dados do Supabase.
- [x] **Step 5:** Se `googleapis` estourar o tamanho ou quebrar no runtime: trocar `src/lib/ga4/client.ts` e `src/lib/sheets/client.ts` por `fetch` + JWT de service account assinado com WebCrypto (RS256), em `src/lib/google/token.ts` com `getGoogleAccessToken(sa: ServiceAccount, scopes: string[]): Promise<string>`. Se `web-push` quebrar: trocar por `@block65/webcrypto-web-push`.
- [x] **Step 6:** Commit com `chore(cf): build do painel no Workers via OpenNext`.

> **Resultado 17/11/2026:** `@opennextjs/cloudflare` 1.20.17 exige Next ≥ 16.4.5 → Next subiu de 16.2.10 para **16.4.6** (só neste branch). Build ok; bundle **4,19 MB gzip** (limite 10 MB) com `googleapis` e `web-push` dentro, sem troca. `wrangler dev`: `/login`, `/docs`, `/privacidade` 200; `/dashboard` sem sessão → 307 `/login` (o `proxy.ts` em runtime Node roda, com aviso de "experimental" do OpenNext); cron sem Bearer → 401. **Step 4 pendente:** abrir logado com dados do Supabase precisa do `.dev.vars` com as chaves (não há `.env` local).

### Task 2: Infra de teste com D1

**Files:**
- Create: `vitest.config.ts` (pool `@cloudflare/vitest-pool-workers`, lendo `wrangler.jsonc`, aplicando `drizzle/*.sql` antes de cada arquivo), `tests/setup.ts`, `tests/smoke.test.ts`
- Modify: `package.json` (script `test`)

- [ ] **Step 1:** Escrever `tests/smoke.test.ts`: `it("D1 responde", ...)` executa `select 1 as ok` no `env.DB` e espera `{ ok: 1 }`.
- [ ] **Step 2:** Rodar `npm test`. Esperado: PASS.
- [ ] **Step 3:** Commit com `test: vitest no pool de Workers com D1`.

### Task 3: Schema Drizzle (35 tabelas) + migration inicial

**Files:**
- Create: `src/db/schema/{core,sales,meta,whatsapp,integrations,ops,auth}.ts`, `src/db/schema/index.ts`, `src/db/client.ts`, `drizzle.config.ts`, `drizzle/0000_init.sql`
- Test: `tests/db/schema.test.ts`

**Interfaces:**
- Produces: `getDb()` de `@/db/client`; as tabelas exportadas em `@/db/schema` com o mesmo nome do Postgres em camelCase (`purchases`, `waDispatchLog`, `metaAdAccounts`...), com colunas no mesmo nome snake_case no SQL.

Tabelas, todas tiradas de `supabase/setup.sql`: `areas, branding, settings, meta_ad_accounts, visitors, events_log, purchases, automation_rules, rule_executions, audit_log, rate_limit_counters, checkout_integrations, product_tiers, push_subscriptions, alert_state, creative_reports, daily_campaign_checkpoints, daily_campaign_sheets, ga, google_sheets_integrations, meta_wa_integrations, wa_dispatch_log, wa_dispatch_rules, wa_optouts, weekly_report_runs, whatsapp_integrations, vturb_integrations, vturb_players, support_ai_sessions`.
**Não migrar** `umbler_integrations` e `umbler_template_sends`: Umbler foi desligado em 16/10.

- [ ] **Step 1:** Teste `schema.test.ts`:
  - `aplica a migration e cria todas as tabelas`: compara `sqlite_master` com a lista acima.
  - `purchases.transaction_id é único`: o segundo insert com o mesmo id lança erro.
  - `purchases.plataforma rejeita valor fora de PLATFORM_IDS`.
  - `areas.id ganha uuid por default`.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Escrever o schema seguindo as regras de tipo das Global Constraints, mantendo índices (`area_id`, `user_id`, `ad_id`, `event_name`, `created_at`), uniques e CHECKs. Os triggers `set_updated_at` viram `$onUpdate(() => new Date().toISOString())` no Drizzle. A FK de `push_subscriptions.user_id` passa a apontar para `user.id` do better-auth (Task 4). Gerar com `npx drizzle-kit generate`.
- [ ] **Step 4:** Rodar os testes. Esperado: PASS.
- [ ] **Step 5:** Commit com `feat(db): schema D1 em Drizzle`.

### Task 4: Login com better-auth

Substitui o Supabase Auth em login, logout, reset de senha, convite, `/admin` (listar, criar e apagar usuário), `/setup` (primeiro admin com `SETUP_TOKEN`) e `proxy.ts`.

**Files:**
- Create: `src/lib/auth/server.ts`, `src/lib/auth/session.ts`, `src/lib/auth/password.ts`, `src/lib/email/send.ts`, `src/app/api/auth/[...all]/route.ts`
- Modify: `proxy.ts`, as páginas e actions de login, reset, `/admin` e `/setup` (achar com `grep -rlE "auth\.(admin\.)?" src`)
- Test: `tests/auth/password.test.ts`, `tests/auth/session.test.ts`

**Interfaces:**
- Produces:
  - `requireUser(): Promise<{ id: string; email: string; role: "admin" | "user" }>`: redireciona pra `/login` se não houver sessão.
  - `getUser(): Promise<... | null>`.
  - `hashPassword(p: string): Promise<string>` e `verifyPassword(hash: string, p: string): Promise<boolean>`: aceitam hash bcrypt (`$2a$`/`$2b$`) importado e o formato nativo do better-auth.
  - `sendEmail({ to, subject, html }): Promise<void>`.

- [ ] **Step 1:** Testes:
  - `verifica senha com hash bcrypt importado do Supabase`: hash `$2a$10$...` gerado com bcryptjs para `"senha-teste-123"` → true; senha errada → false.
  - `hash novo é verificável`.
  - `signup público desligado`: `POST /api/auth/sign-up/email` → 4xx.
  - `requireUser sem cookie redireciona pra /login`.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Configurar better-auth com o adapter Drizzle (D1), `emailAndPassword.disableSignUp: true`, `password: { hash, verify }` de `password.ts`, plugin `admin()`. Reset e convite saem por `sendEmail` (provedor da decisão em aberto nº 2). Convite = criar o usuário + mandar link de reset.
- [ ] **Step 4:** Trocar as chamadas: `signInWithPassword` → `auth.api.signInEmail`; `resetPasswordForEmail`/`verifyOtp`/`exchangeCodeForSession`/`updateUser` → fluxo `forgetPassword`/`resetPassword`; `admin.listUsers/createUser/deleteUser/inviteUserByEmail` → plugin admin; `getUser/getSession` → `getUser()`. O `proxy.ts` passa a checar o cookie de sessão do better-auth.
- [ ] **Step 5:** Rodar `npm test` e `npx tsc --noEmit -p .`. Esperado: PASS e 0 erros.
- [ ] **Step 6:** Commit com `feat(auth): better-auth no D1 com senhas bcrypt legadas`.

### Task 5: Cripto, rate limit e as RPCs em TypeScript

**Files:**
- Modify: `src/lib/crypto.ts`, `src/lib/rate-limit.ts`
- Create: `src/lib/rpc/visitors.ts` (`identifyVisitor`), `src/lib/rpc/events.ts` (`logEvent`)
- Test: `tests/lib/crypto.test.ts`, `tests/lib/rate-limit.test.ts`, `tests/lib/visitors.test.ts`

**Interfaces:**
- Produces (mesmas assinaturas que os chamadores usam hoje em `crypto.ts`/`rate-limit.ts`; manter os nomes exportados):
  - `encryptSecret(plain: string | null): Promise<string | null>` e `decryptSecret(cipher: string | null): Promise<string | null>`: AES-256-GCM, chave = SHA-256 de `ENCRYPTION_KEY`, saída base64 de `iv(12) || ciphertext`, com prefixo `v2:`.
  - `rateLimitHit(key: string, limit: number, windowSeconds: number): Promise<boolean>`: um único `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count`.
  - `identifyVisitor(input)` e `logEvent(input)` com os mesmos parâmetros das funções SQL de `setup.sql` (linhas 472 e 1315). UTMs **last touch**: valor nulo nunca apaga o anterior (`coalesce(excluded.x, visitors.x)`).

- [ ] **Step 1:** Testes:
  - `cifra e decifra ida e volta`.
  - `null entra, null sai`.
  - `decifra falha com chave errada`.
  - `rate limit libera N e bloqueia N+1 na mesma janela`.
  - `identifyVisitor não apaga utm_source quando chega null`.
  - `getPurchases filtra o dia em UTC igual ao Postgres`: compras às `2026-11-13T02:59:59.999Z` e `2026-11-13T03:00:00.000Z` com filtro de 13/11 em BRT → só a segunda entra.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar os testes. Esperado: PASS.
- [ ] **Step 5:** Commit com `feat(db): cripto WebCrypto, rate limit e RPCs em TS`.

### Task 6: Reescrever o acesso a dados (webhooks, captura e API pública)

Primeiro o caminho que **grava** dinheiro e lead.

**Files:**
- Modify: `src/app/api/webhook/[plataforma]/route.ts`, `src/lib/webhooks/*.ts`, `src/app/api/identify/route.ts`, `src/app/api/event/route.ts`, `src/app/api/v1/**`, `src/lib/geo.ts`, `src/lib/webhooks/parse.ts` (headers de GEO)
- Test: `tests/webhooks/purchase.test.ts`, `tests/lib/geo.test.ts`

**Interfaces:**
- Consumes: `getDb`, `decryptSecret`, `rateLimitHit`, `identifyVisitor`, `logEvent`.
- Produces: `readGeo(req: Request): { country?: string; region?: string; city?: string }`, que lê `request.cf` (via `getCloudflareContext().cf`) com fallback nos headers `cf-ipcountry`. O IP sai de `cf-connecting-ip`.

- [ ] **Step 1:** Testes (com os payloads reais já usados em `src/lib/webhooks`):
  - `hotmart aprovado grava purchase com ad_id do xcod`.
  - `upsert por transaction_id é idempotente com payload repetido`: dois POST iguais → 1 linha, `raw_webhook` atualizado.
  - `hottok errado → 401 e nada gravado`.
  - `status desconhecido vira pending`.
  - `readGeo lê country do cf`.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Trocar `createAdminClient()` + query builder por Drizzle nesses arquivos. O `after()` continua igual: o OpenNext mapeia pra `ctx.waitUntil`.
- [ ] **Step 4:** Rodar os testes. Esperado: PASS.
- [ ] **Step 5:** Commit com `feat(db): webhooks, captura e API v1 no D1`.

### Task 7: Reescrever o acesso a dados (painel)

O restante dos ~71 arquivos que importam `@/lib/supabase/*`: dashboard, vendas, financeiro, campanhas, criativos, regras, disparos, integrações, configurações, geo, push, alertas.

**Files:**
- Modify: todo arquivo listado por `grep -rlE "@/lib/supabase/" src`
- Delete (no fim): `src/lib/supabase/`
- Test: `tests/lib/metrics.test.ts`, `tests/lib/dispatch.test.ts`

- [ ] **Step 1:** Testes:
  - `métricas do dashboard batem com fixture`: 3 compras aprovadas, 1 reembolsada → receita e contagem esperadas.
  - `dispatch pula número da wa_optouts`.
  - `dispatch não repete mesmo template pro mesmo número em 24h`.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Reescrever arquivo por arquivo, um commit por página/área (`feat(db): <área> no D1`). Mapeamento: `.select().eq()` → `db.select().from(t).where(eq())`; `.maybeSingle()` → `.get()`; `.upsert()` → `.insert().onConflictDoUpdate()`; `.or()`/`.ilike()` → `or()`/`like()` (SQLite `LIKE` já ignora maiúsculas em ASCII). Toda leitura passa a ser server-side, com `requireUser()` no lugar da RLS.
- [ ] **Step 4:** `realtime-sales.tsx`: trocar o canal Realtime por polling a cada 15 s numa rota `GET /api/sales/latest?since=<iso>` (com `requireUser`).
- [ ] **Step 5:** `grep -rl "supabase" src` → vazio. Remover `@supabase/*` e `supabase` do `package.json`.
- [ ] **Step 6:** `npm test`, `npx tsc --noEmit -p .` e `npx eslint src`. Esperado: tudo limpo.

### Task 8: Crons no Worker

**Files:**
- Create: `worker.ts`
- Modify: `wrangler.jsonc` (`main: "worker.ts"`, `triggers.crons`), `vercel.json` (sem mudança neste branch; só é removido na Task 12)
- Test: `tests/worker/scheduled.test.ts`

**Interfaces:**
- Produces: `CRON_ROUTES: Record<string, string>` (expressão → path):

| Expressão | Rota |
|---|---|
| `*/5 * * * *` | `/api/cron/dispatch` |
| `*/15 * * * *` | `/api/cron/alerts` |
| `2 * * * *` | `/api/cron/daily-campaigns` |
| `7 * * * *` | `/api/cron/rules` |
| `0 21 * * *` | `/api/cron/daily-summary` |
| `30 3 * * *` | `/api/cron/cleanup` |
| `0 9 * * 1` | `/api/cron/weekly-report` |
| `0 8 * * *` | `/api/cron/ga4` |

- [ ] **Step 1:** Testes:
  - `scheduled chama a rota certa por expressão cron com Bearer`.
  - `expressão desconhecida não chama nada e loga`.
  - `rota de cron sem Bearer → 401`.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** O `scheduled(event, env, ctx)` monta um `Request` interno pra `CRON_ROUTES[event.cron]` com `Authorization: Bearer ${env.CRON_SECRET}` e passa pro handler `fetch` do OpenNext.
- [ ] **Step 4:** Rodar os testes. Esperado: PASS.
- [ ] **Step 5:** Commit com `feat(cf): crons via Cron Triggers`.

### Task 9: Docs do template e white label

**Files:**
- Modify: `CLAUDE.md` (stack, env, comandos, "Supabase" → "D1", crons), `PROMPT-IMPLANTACAO.md`, `.env.example` → `.dev.vars.example`
- Delete: `supabase/` (fica no histórico do git)

- [ ] **Step 1:** Atualizar a documentação para "clona → `wrangler d1 create` → `wrangler d1 migrations apply` → `wrangler secret put` → `npm run cf:deploy` → `/setup`".
- [ ] **Step 2:** Commit com `docs: template white label na Cloudflare`.

### Task 10: Script de migração de dados Supabase → D1

**Files:**
- Create: `scripts/migrate-from-supabase.ts`
- Test: `tests/scripts/migrate.test.ts`

**Interfaces:**
- Consumes: conexão Postgres do Supabase (connection string pedida na sessão, **nunca gravada**), `encryptSecret` de `@/lib/crypto`.
- Produces: `npx tsx scripts/migrate-from-supabase.ts --pg "<conn>" --d1 <nome> [--dry-run]`. Gera `.migration/*.sql` em lotes de até 100 KB e aplica com `wrangler d1 execute --remote --file`.

- [ ] **Step 1:** Testes (funções puras do script):
  - `converte timestamptz pra ISO UTC com milissegundos`.
  - `converte jsonb pra texto JSON`.
  - `reimporta segredo pgcrypto e decifra com AES-GCM`: lê o valor com `app_decrypt(col, LEGACY_ENCRYPTION_KEY)` no Postgres, recifra com `encryptSecret`, e o `decryptSecret` devolve o original.
  - `usuário do auth.users vira user + account com o hash bcrypt`.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar. Ordem respeitando FK: `areas → branding/settings → usuários → resto`. Colunas cifradas: `meta_ad_accounts`, `checkout_integrations.secret`, `meta_wa_integrations`, `whatsapp_integrations`, `google_sheets_integrations`, `vturb_integrations` (conferir no schema quais colunas são cifradas).
- [ ] **Step 4:** Rodar `--dry-run` contra produção (só leitura). Anotar o tamanho total (D1 aceita até 10 GB por banco) e a contagem por tabela.
- [ ] **Step 5:** Commit com `feat(scripts): migração Supabase → D1`.

### Task 11: Ensaio em staging e runbook da virada

**Files:**
- Create: `docs/superpowers/plans/2026-11-13-runbook-virada-cloudflare.md`

- [ ] **Step 1:** Criar o D1 `dash-axds-staging`, importar uma cópia da produção e subir o Worker em `*.workers.dev`.
- [ ] **Step 2:** Roteiro de conferência em staging:
  - login com usuário real (senha antiga);
  - dashboard com o mesmo total de vendas dos últimos 30 dias que a Vercel;
  - `/campanhas` lendo a Meta;
  - webhook de teste da Hotmart grava venda;
  - disparo de teste só pro 5511952134563;
  - push no celular;
  - os 8 crons aparecendo em `wrangler tail`.
- [ ] **Step 3:** Escrever o runbook:
  1. Avisar o Gustavo da janela (~30 min, de madrugada).
  2. Fazer o `main` encaminhar as rotas de entrada (`/api/webhook/*`, `/api/identify`, `/api/event`, `/api/v1/*`) para o Worker via `rewrites` no `next.config.ts` (mesmo framework, sem violar a regra da Vercel). A partir daí só o Worker grava.
  3. Desligar os pg_cron com `cron.unschedule`.
  4. Rodar a importação final.
  5. Reenviar pelo painel de cada plataforma as vendas que caíram entre o passo 2 e o 4 (o upsert é idempotente).
  6. Ligar os Cron Triggers.
  7. Trocar a URL do webhook em cada plataforma e no app da Meta (lista na Task 12).
  8. Plano de volta: tirar os `rewrites` e reativar os pg_cron. O Supabase fica intacto por 30 dias.
- [ ] **Step 4:** Commit com `docs: runbook da virada`.

### Task 12: Virada e desligamento

- [ ] **Step 1:** Com OK do Fabrício: executar o runbook.
- [ ] **Step 2:** Atualizar as URLs de webhook em Hotmart, Kiwify, Kirvano, PerfectPay, Ticto, Cakto, Greenn, PayT, no webhook de status da Meta WA e nas URLs `/docs` e `/privacidade` do app da Meta. Quando todas estiverem trocadas, tirar os `rewrites` da Vercel.
- [ ] **Step 3:** Fazer o merge de `cloudflare` → `main` e remover o `vercel.json`. Avisar o DW1 antes, porque daqui pra frente o deploy é `npm run cf:deploy` ou Workers Builds conectado ao GitHub.
- [ ] **Step 4:** Depois de 30 dias estável: pausar o projeto Supabase `cdexpdefgrbnwgknssxk` (não apagar) e desconectar a Vercel.
- [ ] **Step 5:** Atualizar o HUB do Obsidian (produção, deploy, armadilhas e "Estado atual").
