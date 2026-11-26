/**
 * Entrada do Worker: o `fetch` é o Next (OpenNext) e o `scheduled` substitui o
 * pg_cron do Supabase / os crons da Vercel. Cada expressão cron chama a rota
 * correspondente com `Authorization: Bearer $CRON_SECRET` (as rotas falham
 * fechadas sem ele).
 */
// @ts-expect-error -- gerado pelo `opennextjs-cloudflare build`
import { default as handler } from "./.open-next/worker.js";

export const CRON_ROUTES: Record<string, string> = {
  "* * * * *": "/api/cron/webhooks",
  "*/5 * * * *": "/api/cron/dispatch",
  "*/15 * * * *": "/api/cron/alerts",
  "7 * * * *": "/api/cron/rules",
  "0 21 * * *": "/api/cron/daily-summary",
  "30 3 * * *": "/api/cron/cleanup",
  "0 9 * * 1": "/api/cron/weekly-report",
  "0 8 * * *": "/api/cron/ga4",
};

type Env = { CRON_SECRET?: string; [k: string]: unknown };
type Ctx = { waitUntil(p: Promise<unknown>): void; passThroughOnException?(): void };

export default {
  fetch: handler.fetch,

  async scheduled(event: { cron: string }, env: Env, ctx: Ctx) {
    const path = CRON_ROUTES[event.cron];
    if (!path) {
      console.error(`[cron] expressão sem rota: ${event.cron}`);
      return;
    }
    if (!env.CRON_SECRET) {
      console.error(`[cron] CRON_SECRET ausente — ${path} não roda`);
      return;
    }
    const req = new Request(`https://cron.internal${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${env.CRON_SECRET}`, "user-agent": "cloudflare-cron" },
    });
    const res: Response = await handler.fetch(req, env, ctx);
    const body = await res.text().catch(() => "");
    const line = `[cron] ${event.cron} ${path} → ${res.status} ${body.slice(0, 200)}`;
    if (res.ok) console.log(line);
    else console.error(line);
  },
};
