# Segurança e checklist de fechamento

Auditoria da Fase 9. Use esta página antes de publicar cada instância.

---

## Checklist antes de ir para produção

### No Supabase
- [ ] **Cadastro público DESLIGADO** — Authentication → Providers → Email →
      desmarcar "Allow new users to sign up". **Este passo é manual e obrigatório**:
      o código não consegue desligar isso sozinho.
- [ ] Migrations aplicadas (`npx supabase db push`).
- [ ] Confirmar que a chave `service_role`/secret **não** foi colada em nenhuma
      variável com prefixo `NEXT_PUBLIC_`.

### Na Vercel
- [ ] As 6 variáveis de ambiente configuradas (ver `.env.example`).
- [ ] `ENCRYPTION_KEY` gerada aleatoriamente e **guardada em local seguro** — se
      for perdida, os segredos cifrados no banco ficam irrecuperáveis.
- [ ] `CRON_SECRET` configurada (sem ela os crons ficam desativados).
- [ ] Crons aparecendo em Settings → Cron Jobs.

### Depois do primeiro acesso
- [ ] `/setup` já se desativou (acesse e confirme a mensagem "Setup já concluído").
- [ ] Token da Meta é de **System User** com `ads_read` + `ads_management`
      (o botão "Testar conexão" valida isso).
- [ ] URL de webhook cadastrada no checkout que você usa (Hotmart e/ou Kiwify),
      com hottok/token salvos no painel.
- [ ] `utm_content={{ad.id}}` configurado nos anúncios.
- [ ] Código de rastreio externo levando o `ad_id` ao checkout (`xcod` na Hotmart,
      `utm_content` na Kiwify) — **confirmado com uma venda real**.
- [ ] *(Só se usar a captura própria)* Snippet instalado e origens permitidas (CORS)
      cadastradas por área.

---

## O que foi auditado (e verificado)

| Item | Status |
|---|---|
| RLS habilitada nas 11 tabelas | ✅ verificado por varredura nas migrations |
| Leitura só para `authenticated`; escrita só `service_role` | ✅ policies apenas de SELECT |
| `rate_limit_counters` sem policy (só servidor) | ✅ proposital |
| `service_role` só no servidor | ✅ `admin.ts` com `server-only` |
| `NEXT_PUBLIC_` expostos | ✅ apenas URL e ANON |
| Segredos cifrados (pgcrypto) | ✅ `app_encrypt`/`app_decrypt`, EXECUTE só para `service_role` (ver nota abaixo) |
| `ENCRYPTION_KEY` fora do banco | ✅ só em env |
| Endpoints de captura: zod + rate limit + CORS | ✅ via `guardCapture` |
| Webhooks: validação nativa | ✅ hottok e HMAC, ambos em tempo constante |
| Webhooks: validação de dados | ✅ zod sobre os campos extraídos |
| `ad_id` aceito só se numérico | ✅ `^\d{5,25}$` |
| Escritas na Meta com confirmação + auditoria | ✅ modal obrigatório, `audit_log` |
| Crons protegidos | ✅ `CRON_SECRET`, falham fechados |
| Nenhum segredo versionado | ✅ só `.env.example` |
| Zero hardcode (credenciais/IDs/domínios/marca) | ✅ varredura no repo |

---

### `REVOKE ... FROM PUBLIC` não basta no Supabase

Encontrado ao validar uma instalação real (2026-07-25), **não** pela leitura das
migrations — por isso a auditoria original marcou como ✅ algo que não era verdade.

Todo projeto Supabase traz `DEFAULT PRIVILEGES` que concedem `EXECUTE` (funções) e
privilégios de tabela aos papéis `anon` e `authenticated` **explicitamente, por nome**.
Um `revoke all ... from public` remove só o grant do pseudo-papel `PUBLIC` — os grants
nominais a `anon`/`authenticated` sobrevivem.

Consequência observada com a chave anon (que é pública, vai no bundle do browser):
`app_encrypt`, `app_decrypt`, `rate_limit_hit`, `identify_visitor` e `log_event`
executavam normalmente. As duas últimas são `security definer` e escrevem **furando a
RLS**, pulando CORS, zod e rate limit dos endpoints públicos.

Corrigido em `20260725120000_function_grants_lockdown.sql`, que revoga de
`anon, authenticated` e ajusta os `DEFAULT PRIVILEGES` para funções futuras.
Depois da correção, as seis funções respondem `403 permission denied` para anon e
para authenticated.

**Como conferir na sua instância** — com a chave anon:

```
POST /rest/v1/rpc/app_decrypt  → deve dar 403 permission denied
```

Se der `200`, a migration de lockdown não foi aplicada.

**Pendente (defesa em profundidade):** os privilégios de **tabela** de
`anon`/`authenticated` continuam abertos pelo mesmo motivo. Hoje a RLS bloqueia toda
escrita — verificado: `POST` com anon responde `new row violates row-level security
policy`, e não `permission denied for table`. Mas a proteção depende de uma camada só.

## Decisões de segurança que valem explicar

**O `public_token` da área não é um segredo.** Ele aparece no fonte da landing page
e serve só para dizer de qual área é o hit. A proteção real é CORS + rate limit.
Ele **nunca** autoriza escrita privilegiada.

**`allowed_origins` vazio bloqueia a captura.** É o estado "ainda não configurado".
Preferimos falhar fechado a aceitar dados de qualquer origem.

**Os crons falham fechados.** Sem `CRON_SECRET` no ambiente, as rotas devolvem 401 —
melhor um cron que não roda do que um endpoint que pausa campanhas sem autenticação.

**Payload de webhook inválido responde 2xx.** É erro permanente; devolver 5xx faria a
plataforma reenviar para sempre. O payload bruto fica salvo em `raw_webhook`.

**Rate limit faz "fail open".** Se o banco falhar na checagem, a requisição passa.
Para captura, perder dado é pior que aceitar um excesso momentâneo.

---

## Pontos em aberto (confirmar com dados reais)

**Em qual caminho do payload o `ad_id` chega.** Sem captura própria, o webhook é a
única fonte de atribuição. O parser tenta vários caminhos candidatos e o `raw_webhook`
fica salvo — dá para conferir e ajustar depois da primeira venda, sem perder dado.

Não foi possível validar contra as docs oficiais (páginas renderizadas por JS):

1. **Kiwify `sck` vs `s1`** — lemos os dois.
2. **Kiwify em centavos** — `charge_amount` inteiro é dividido por 100.
   **É o de maior impacto**: se estiver errado, os valores saem 100× errados.
3. **Algoritmo do HMAC da Kiwify** — aceitamos sha1 e sha256 (ambos exigem o segredo).

Os três se resolvem com uma venda de teste real: o `raw_webhook` fica salvo, então dá
para conferir e corrigir sem perder dado.

---

## Versões utilizadas

| Item | Versão | Documentação |
|---|---|---|
| Next.js (App Router, Turbopack) | 16.2.10 | https://nextjs.org/docs |
| React / React DOM | 19.2.4 | https://react.dev |
| Tailwind CSS | 4.x | https://tailwindcss.com/docs |
| @supabase/ssr | 0.12.x | https://supabase.com/docs/guides/auth/server-side/nextjs |
| @supabase/supabase-js | 2.110.x | https://supabase.com/docs/reference/javascript |
| Supabase CLI (devDep) | 2.109.x | https://supabase.com/docs/guides/cli |
| Meta Graph + Marketing API | **v25.0** | https://developers.facebook.com/docs/graph-api/changelog |
| Recharts | 3.x | https://recharts.org |
| Radix UI (dialog, dropdown) | 1.x / 2.x | https://www.radix-ui.com/primitives |
| zod | 4.x | https://zod.dev |
| nanoid | 5.x | https://github.com/ai/nanoid |
| lucide-react | 1.x | https://lucide.dev |

A versão da API da Meta vive numa constante única em
[`src/lib/meta/config.ts`](./src/lib/meta/config.ts) (`META_API_VERSION`).
