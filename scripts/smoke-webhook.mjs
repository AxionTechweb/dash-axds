// Teste do caminho do dinheiro no D1 local: webhook Hotmart → purchases.
// Uso: node scripts/smoke-webhook.mjs   (com `wrangler dev` rodando e .dev.vars local)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";

const BASE = "http://127.0.0.1:8787";
const vars = Object.fromEntries(
  readFileSync(".dev.vars", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);

async function aesEncrypt(plain, secret) {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
  return "v2:" + Buffer.concat([iv, ct]).toString("base64");
}

function d1(sql) {
  mkdirSync(".wrangler/tmp", { recursive: true });
  const file = ".wrangler/tmp/smoke.sql";
  writeFileSync(file, sql);
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "dash-axds", "--local", "--json", "--file", file], {
    encoding: "utf8",
    shell: true,
  });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
}

const check = (label, cond, extra = "") => {
  console.log(`${cond ? "OK    " : "FALHOU"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) process.exitCode = 1;
};

const [area] = d1("select id, public_token from areas limit 1");
const hottok = "hottok-teste-local";
const enc = await aesEncrypt(hottok, vars.ENCRYPTION_KEY);
d1(
  `insert into checkout_integrations (area_id, plataforma, secret, enabled) values ('${area.id}', 'hotmart', '${enc}', 1)
   on conflict (area_id, plataforma) do update set secret = excluded.secret, enabled = 1`,
);

const tx = `HP-TESTE-${Date.now()}`;
const payload = {
  event: "PURCHASE_APPROVED",
  data: {
    product: { id: 1, name: "Produto Teste" },
    buyer: { email: "comprador@exemplo.com", checkout_phone: "5511999990000", name: "Comprador" },
    purchase: {
      transaction: tx,
      status: "APPROVED",
      price: { value: 197.0, currency_value: "BRL" },
      origin: { xcod: "120212345678901234", sck: "abc123" },
      payment: { type: "PIX" },
    },
  },
};

async function post(token) {
  const r = await fetch(`${BASE}/api/webhook/hotmart?a=${area.public_token}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hotmart-hottok": token },
    body: JSON.stringify(payload),
  });
  return { status: r.status, body: await r.text() };
}

const bad = await post("hottok-errado");
check("hottok errado → 401", bad.status === 401, `${bad.status} ${bad.body.slice(0, 120)}`);

const r1 = await post(hottok);
check("venda aprovada aceita", r1.status === 200, `${r1.status} ${r1.body.slice(0, 160)}`);
const r2 = await post(hottok);
check("reenvio do mesmo webhook aceito", r2.status === 200, `${r2.status}`);

const rows = d1(`select status, valor, ad_id, plataforma, payment_method, created_at, length(raw_webhook) raw from purchases where transaction_id = '${tx}'`);
check("gravou 1 linha (sem duplicar)", rows.length === 1, `${rows.length} linha(s)`);
if (rows[0]) {
  const p = rows[0];
  check("status approved", p.status === "approved", p.status);
  check("valor 197", p.valor === 197, String(p.valor));
  check("ad_id do xcod", p.ad_id === "120212345678901234", p.ad_id);
  check("raw_webhook salvo", p.raw > 50, String(p.raw));
  check("created_at em ISO UTC", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(p.created_at), p.created_at);
}
