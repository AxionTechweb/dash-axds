# Painel de Tracking e Atribuição (White Label)

Painel **single-tenant** de leitura e análise de tracking e atribuição de anúncios.
Coleta visitas, eventos e compras (webhooks Hotmart/Kiwify) e lê insights da Meta Ads.
**Não envia** eventos de conversão para nenhuma plataforma (sem Conversions API / GA4).

Distribuído como **template**: cada pessoa clona, sobe o próprio Supabase + Vercel e
configura as próprias credenciais pelo painel. Zero hardcode de credenciais/marca.

> Documentação técnica e regras de arquitetura: [`CLAUDE.md`](./CLAUDE.md).
> O passo a passo completo de instalação (Vercel, /setup, webhooks, snippet) será
> consolidado na Fase 8.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind v4 · Supabase (Postgres + Auth + Realtime)
· deploy na Vercel · Meta Graph/Marketing API v25.0.

## Desenvolvimento local

Pré-requisitos: Node.js 20.9+ e uma conta no [Supabase](https://supabase.com).

```bash
# 1. Instalar dependências
npm install

# 2. Configurar ambiente (só infra — credenciais de integração vão pelo painel)
cp .env.example .env.local   # e preencha os valores

# 3. Aplicar as migrations no seu projeto Supabase (cloud)
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push

# 4. Rodar o dev server
npm run dev
```

Abra http://localhost:3000.

## Variáveis de ambiente

Só infra vive em env (ver [`.env.example`](./.env.example)):

| Variável | Descrição |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon/publishable (client-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service_role/secret (só servidor) |
| `ENCRYPTION_KEY` | Chave de cifra dos segredos (pgcrypto); nunca commitar |
| `SETUP_TOKEN` | Protege a rota `/setup` de primeira execução |

## Scripts

```bash
npm run dev     # dev server (Turbopack)
npm run build   # build de produção
npm run lint    # eslint
```

## Segurança (resumo)

- RLS em todas as tabelas: leitura só por usuário autenticado; escrita só no servidor.
- Segredos de integração cifrados no banco (pgcrypto) com `ENCRYPTION_KEY` do env.
- Cadastro público **desligado** (configurar no dashboard do Supabase).
- Endpoints públicos com validação (zod), rate limit (Postgres) e CORS por área.
