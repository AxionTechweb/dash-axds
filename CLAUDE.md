@AGENTS.md

# Painel de Tracking e Atribuição (White Label)

> Documento vivo do projeto. **Atualizar a cada fase.** Regras do Next.js 16 estão
> em `AGENTS.md` (importado acima) — leia antes de escrever código do App Router.

## O que é

Um **painel de LEITURA e análise** de tracking e atribuição de anúncios. O sistema:

- **COLETA** dados próprios: visitas, eventos e compras (webhooks Hotmart/Kiwify).
- **LÊ** insights e hierarquia de campanhas da Meta Ads (leitura de dados + escrita de
  *gestão*: status/orçamento das campanhas).
- **NÃO ENVIA** nenhum evento de conversão para fora: **sem** Conversions API da Meta e
  **sem** Measurement Protocol do GA4. Nunca adicionar envio de conversões.

## White Label (o repositório é um template)

- Distribuído como template **single-tenant**: cada pessoa clona, sobe o próprio
  Supabase + Vercel e configura as próprias credenciais **pelo painel**. Cada deploy é
  uma instância independente. **Não é SaaS multi-tenant** — não complicar a RLS por isso.
- **ZERO HARDCODE**: nenhuma credencial, ID de conta, domínio, e-mail ou nome de marca
  fixo no código. O que é da instância vem de **env** (só infra) ou do **painel**
  (credenciais + branding). Nenhum dado real/de teste commitado.
- **Branding** configurável pelo painel (tabela `branding`, global da instância):
  product_name, logo claro/escuro, favicon, override opcional da cor primária. Defaults
  **neutros** no repo (product_name = "Dashboard").
- **Migrations versionadas** (`supabase/migrations`, via Supabase CLI) — schema 100%
  reproduzível em qualquer projeto Supabase novo. Seed **opcional** (script separado,
  nunca automático).

## Stack e versões (estáveis; docs conferidas em 2026-07)

| Item | Versão | Doc |
|---|---|---|
| Next.js (App Router, Turbopack) | 16.2.10 | https://nextjs.org/docs |
| React | 19.2.4 | https://react.dev |
| Tailwind CSS | v4 (config em CSS, `@theme`) | https://tailwindcss.com/docs |
| @supabase/ssr | 0.12.x | https://supabase.com/docs/guides/auth/server-side/nextjs |
| @supabase/supabase-js | 2.110.x | https://supabase.com/docs |
| Supabase CLI (devDep) | 2.109.x | https://supabase.com/docs/guides/cli |
| Meta Graph + Marketing API | **v25.0** | https://developers.facebook.com/docs/graph-api/changelog |
| zod | 4.x · nanoid 5.x | — |

- **Sempre usar a versão estável mais recente** e conferir a doc oficial atual antes de
  integrar cada plataforma.
- A versão da Graph/Marketing API fica numa **constante única** (`META_API_VERSION`) —
  criar em `src/lib/meta/config.ts` na Fase 5. Base: `https://graph.facebook.com/${META_API_VERSION}`.
- **A conferir na fase respectiva:** Kiwify `sck` vs `s1` (Fase 4, doc oficial da Kiwify);
  reenvio das 2 imagens de referência antes das Fases 5/6.

## Regras de arquitetura (não violar)

### Identidade
- `user_id` = ID **ANÔNIMO do visitante** (nanoid, ver `src/lib/ids.ts`). **Sem** relação
  com `auth.users`, **sem** FK para `auth.users`, **fora** da RLS. Compacto/URL-safe,
  compatível com o `sck` da Hotmart.
- A RLS do painel é single-tenant: **LEITURA só por usuário autenticado**; **ESCRITA só
  no servidor** (service_role, que faz bypass de RLS). Signup público **OFF** (configurar
  no dashboard do Supabase — item do checklist de fechamento).

### Áreas (workspaces)
- Quase toda tabela tem `area_id` (indexado). Branding é **global** da instância. O painel
  inteiro filtra pela área ativa. Endpoints públicos identificam a área por token/parâmetro.

### Segredos e criptografia
- Em **env**, só infra: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `SETUP_TOKEN`. Nada sensível com
  `NEXT_PUBLIC_` além da URL/anon. Ver `.env.example` e `src/lib/env.ts`.
- Segredos de integração (hottok, token Kiwify, ads_token) são **cifrados** com pgcrypto
  usando `ENCRYPTION_KEY` (que vive **só no env**, nunca no banco). Ciphertext guardado
  como **TEXT base64**. Cifra/decifra via `app_encrypt`/`app_decrypt` (SQL), com EXECUTE
  liberado **só ao service_role** — decifra acontece **só no servidor**. Helper TS:
  `src/lib/crypto.ts`.
- `service_role`/secret **só no servidor** (`src/lib/supabase/admin.ts`, com `server-only`).

### Endpoints públicos (captura/webhooks)
- Validar entrada com **zod**; **rate limiting em Postgres** (`src/lib/rate-limit.ts` →
  função `rate_limit_hit`), nunca em memória; **CORS** pelos `allowed_origins` da área.
- Webhooks validam pelo mecanismo **NATIVO** de cada plataforma (hottok / assinatura HMAC),
  não por token em URL.

## LGPD — dados pessoais em claro (minimização)

Guardamos em claro **apenas o necessário para o match** de compra ao visitante:
- `visitors`: `email`, `telefone`, `nome` — usados para casar a venda quando o `user_id`
  não veio no webhook, e para exibir (mascarado) na tela de Vendas.
- `purchases`: `email`, `telefone` — vêm do webhook da plataforma; necessários para o match
  e conciliação financeira.
- `ip` e `user_agent` (visitors) e `ip` (events_log): atribuição/geo e antifraude básica.
- `raw_webhook` (purchases): payload bruto para auditoria (pode conter PII do comprador).

Não coletamos mais do que isso. Exibição na UI é **mascarada**. GEO vem dos headers da
Vercel (país/estado/cidade), sem provedor externo. Nenhum dado é enviado a plataformas
externas por este sistema.

## Modelo de dados

Migrations em `supabase/migrations/`:
- `..120000_extensions_and_functions.sql` — pgcrypto, `set_updated_at`, `app_encrypt`/`app_decrypt`.
- `..120100_tables.sql` — todas as tabelas + índices + triggers.
- `..120200_rate_limit.sql` — `rate_limit_counters` + `rate_limit_hit` + `rate_limit_cleanup`.
- `..120300_rls.sql` — RLS em todas as tabelas + policies (SELECT authenticated) + grants.
- `..(0722)120000_capture.sql` — `areas.public_token` + RPCs `identify_visitor` e `log_event`.

Tabelas: `areas`, `branding` (global, linha única), `settings` (1/área), `meta_ad_accounts`
(N/área), `visitors`, `events_log`, `purchases` (`ad_id` em coluna própria; `transaction_id`
único; status interno unificado), `automation_rules`, `rule_executions`, `audit_log`,
`rate_limit_counters`. Índices por `area_id`, `user_id`, `ad_id`, `event_name`, `created_at`.

**Status interno de compra** (unificado): `approved`, `pending`, `refunded`, `chargeback`,
`canceled`. **Plataforma**: `hotmart`, `kiwify`.

## Captura (Fase 3)

- **Snippet**: `public/track.js`, embutido nas landing pages com o token público da área:
  `<script src="https://SEU-PAINEL/track.js" data-area="TOKEN" defer></script>`.
  Gera/lê o `user_id` (cookie first-party `_tuid` + localStorage), captura UTMs/referrer,
  chama `/api/identify` e `/api/event`, e **decora** links de checkout e WhatsApp.
- **`areas.public_token`**: identifica a área nos endpoints públicos. Fica **visível** no
  fonte da landing page — **não é segredo**. A proteção real é **CORS (`allowed_origins`
  da área) + rate limit**. Nunca usar esse token para autorizar escrita privilegiada.
- **Sem preflight**: o snippet envia `Content-Type: text/plain`, o que evita o OPTIONS
  do CORS. O servidor faz o parse do JSON mesmo assim. `OPTIONS` continua implementado
  (token via `?a=`) para quem preferir `application/json`.
- **CORS**: `allowed_origins` **vazio nega tudo** (estado "ainda não configurado") e o erro
  é explícito no corpo da resposta. Requisição sem header `Origin` (server-to-server) passa,
  protegida por token + rate limit. Suporta curinga `*.exemplo.com`.
- **UTMs = last touch**: valor novo sobrescreve, valor nulo **nunca apaga** o anterior
  (`coalesce` nas RPCs). Assim, navegação interna sem UTM não perde a origem da visita.
- **IP/user-agent/GEO vêm do SERVIDOR** (headers `x-forwarded-for`, `x-vercel-ip-*`),
  nunca do que o cliente enviar.
- Rate limit: `identify` 120/min e `event` 300/min, por área + IP.

## Atribuição por anúncio (ad_id) — sempre por ID exato

- Anúncios usam `utm_content={{ad.id}}`. O site propaga o `ad_id` para o checkout:
  Hotmart via `src`, Kiwify via `utm_content`. Webhooks extraem e gravam em `purchases.ad_id`
  (**validar formato numérico**). Fallback: `utm_content` do visitor casado por `user_id`.
- Cruzamento com a Meta **sempre por ID** (nunca por nome). Hierarquia campanha→conjunto→
  anúncio vem da Ads API a partir do `ad_id` (com cache).
- Vinculação cross-domain: `user_id` viaja na URL do checkout como `sck` (Hotmart) e em
  links de WhatsApp. No webhook, casar por `user_id`; se faltar, por email/telefone.

## Convenções de código

- Next.js App Router + TS, pasta `src/`. Import alias `@/*`. npm (lockfile commitado).
- Supabase: dev **contra projeto cloud** (`supabase link` + `supabase db push`), sem Docker.
- Clientes Supabase: `src/lib/supabase/{client,server,admin}.ts` (browser/servidor/service_role).
- **Next.js 16 (breaking):** `cookies()`, `headers()`, `params`, `searchParams` são
  **assíncronos** (usar `await`). Middleware foi renomeado para **`proxy.ts`** (runtime
  nodejs, sem edge) — usar na Fase 2 para refresh de sessão + proteção de rotas. `next lint`
  removido (usar `eslint` direto). Sem `serverRuntimeConfig`/`publicRuntimeConfig` (usar env).

## Fluxo de trabalho (fases)

Construção **em fases**. Ao fim de cada fase: **commit** e **aguardar aprovação** antes da
próxima. Plano completo: `~/.claude/plans/concurrent-riding-sedgewick.md`.

- [x] **Fase 1** — Setup + schema + RLS + criptografia + rate limit.
- [x] **Fase 2** — Auth + shell do painel (sidebar, Áreas, tema, /setup).
- [x] **Fase 3** — Captura (snippet + /api/identify + /api/event).
- [ ] **Fase 4** — Webhooks Hotmart/Kiwify.
- [ ] **Fase 5** — Dashboard.
- [ ] **Fase 6** — Campanhas (leitura + edição inline na Meta).
- [ ] **Fase 7** — Financeiro, Regras, Admin, Geo, Vendas, Integrações.
- [ ] **Fase 8** — Empacotamento white label (branding, onboarding, docs).
- [ ] **Fase 9** — Auditoria de segurança + deploy.

## Comandos úteis

```bash
npm run dev            # dev server (Turbopack)
npm run build          # build de produção
npm run lint           # eslint
npx supabase link      # linkar ao projeto Supabase (cloud)
npx supabase db push   # aplicar migrations no projeto linkado
```
