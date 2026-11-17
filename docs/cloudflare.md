# Painel na Cloudflare (Workers + D1)

O painel roda num Worker (Next 16 via OpenNext) com o banco no D1. O código de
dados continua chamando a API do supabase-js (`.from().select().eq()`), mas o
cliente por baixo é a camada `src/lib/db` sobre o D1.

## Peças

| Peça | Onde |
|---|---|
| Schema do banco | `d1/schema.src.sql` → `node scripts/build-d1-schema.mjs` gera `d1/migrations/0001_init.sql` e `src/lib/db/schema-meta.ts` |
| Cliente compatível (from/select/eq/upsert...) | `src/lib/db/query.ts` |
| Funções que eram SQL (`rate_limit_hit`, `identify_visitor`, `log_event`, cifra) | `src/lib/db/rpc.ts`, `src/lib/db/aes.ts` |
| Login (bcrypt + sessão em cookie, reset/convite por e-mail) | `src/lib/db/auth.ts`, `src/lib/email/send.ts` (Resend) |
| Crons (9) | `worker.ts` (`CRON_ROUTES`) + `triggers.crons` no `wrangler.jsonc` |
| Cópia dos dados do Supabase | `scripts/migrate-from-supabase.mjs` |

**Coluna nova no banco:** edite `d1/schema.src.sql`, crie `d1/migrations/000N_<nome>.sql`
com o `ALTER TABLE` e rode `node scripts/build-d1-schema.mjs` só para atualizar o
`schema-meta.ts` (não reescreva a 0001 depois que ela foi aplicada em produção).

**`compatibility_date`:** fica em `2025-09-01`. Com datas de 2026 o `env` do Worker
deixou de trazer as vars/secrets (process.env vazio) — testar antes de subir.

## Secrets do Worker

`wrangler secret put <NOME>` (ou `wrangler secret bulk arquivo.json`):

| Nome | Valor |
|---|---|
| `ENCRYPTION_KEY` | **a mesma da Vercel** (os segredos importados são recifrados com ela) |
| `SETUP_TOKEN` | aleatório |
| `CRON_SECRET` | aleatório (o Worker manda nos crons) |
| `SITE_URL` | URL pública do painel (links dos e-mails) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend (`Painel <painel@dominio>`; domínio verificado no Resend) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | os mesmos da Vercel (senão os celulares inscritos no push param de receber) |

## Subir (primeira vez)

```bash
export CLOUDFLARE_API_TOKEN=...   # só na sessão
export CLOUDFLARE_ACCOUNT_ID=...
npx wrangler d1 create dash-axds              # copie o database_id para o wrangler.jsonc
npx wrangler d1 migrations apply dash-axds --remote
npm run cf:deploy                             # build + deploy
npx wrangler secret bulk secrets.json         # arquivo temporário; apague depois
```

## Dados do Supabase → D1

```bash
export SUPABASE_DB_URL="postgresql://..."     # Supabase → Connect → Session pooler
export ENCRYPTION_KEY="..."                   # a da Vercel
node scripts/migrate-from-supabase.mjs --dry-run                 # contagem
node scripts/migrate-from-supabase.mjs --fresh --apply           # carga inicial (apaga e recarrega)
```

Sem `--fresh` o script só acrescenta (`INSERT OR IGNORE`) e nunca sobrescreve o
que já está no D1. `.migration/` (dump com PII) fica fora do git.

## Virada (sem trocar URL em nenhuma plataforma)

1. Worker no ar com a carga inicial e conferido (login com senha antiga, totais
   de vendas iguais aos da Vercel, /campanhas lendo a Meta).
2. No `main`: `next.config.ts` com `rewrites` mandando **tudo** para o Worker e
   `vercel.json` sem `crons`. Push = `dash-axion.vercel.app` passa a ser só um
   proxy. Webhooks (Hotmart, Kiwify… e Meta WA) continuam na mesma URL.
3. `node scripts/migrate-from-supabase.mjs --apply --unschedule-pg-cron`: desliga
   o pg_cron e copia o que chegou no Supabase até o passo 2 (só acrescenta).
4. Conferir `wrangler tail` (crons rodando) e uma venda real chegando.
5. Volta, se precisar: reverter o commit do passo 2 e religar o pg_cron
   (`supabase/migrations/20261017120200_schedule_crons_pg_cron.sql`). O Supabase
   fica intacto por 30 dias.
