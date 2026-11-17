// Teste de fumaça do painel rodando no `wrangler dev` (D1 local).
// Uso: node scripts/smoke-local.mjs [baseUrl]
// Envia os formulários como um navegador sem JS (server actions progressivas).
const BASE = process.argv[2] ?? "http://127.0.0.1:8787";
const EMAIL = "teste@local.dev";
const PASS = "senha-teste-123";
let cookie = "";

function keepCookies(res) {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const [pair] = c.split(";");
    const [name] = pair.split("=");
    const rest = cookie
      .split("; ")
      .filter((x) => x && !x.startsWith(`${name}=`));
    if (!/=$/.test(pair) && !/Max-Age=0/i.test(c)) rest.push(pair);
    cookie = rest.join("; ");
  }
}

async function get(path) {
  const res = await fetch(BASE + path, { headers: { cookie }, redirect: "manual" });
  keepCookies(res);
  return { status: res.status, location: res.headers.get("location"), html: await res.text() };
}

function decode(s) {
  return s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#x27;/g, "'");
}

/**
 * Chama a server action do formulário como o React faz com JS ligado:
 * header `Next-Action: <id>` e corpo no formato do encodeReply
 * (`0` = argumentos, `1_<campo>` = o FormData passado como 2º argumento).
 */
async function submit(path, fields) {
  const page = await get(path);
  const idMatch = page.html.match(/name="\$ACTION_1:0" value="([^"]+)"/);
  const id = idMatch ? JSON.parse(decode(idMatch[1])).id : null;
  if (!id) throw new Error(`action não encontrada em ${path}`);
  const prev = page.html.match(/name="\$ACTION_1:1" value="([^"]+)"/);
  const prevState = prev ? JSON.parse(decode(prev[1]))[0] : {};
  const form = new FormData();
  form.append("0", JSON.stringify([prevState, "$K1"]));
  for (const [k, v] of Object.entries(fields)) form.append(`1_${k}`, v);
  const res = await fetch(BASE + path, {
    method: "POST",
    body: form,
    headers: { cookie, origin: BASE, "next-action": id, accept: "text/x-component" },
    redirect: "manual",
  });
  keepCookies(res);
  return { status: res.status, location: res.headers.get("x-action-redirect") ?? res.headers.get("location"), html: await res.text() };
}

function check(label, cond, extra = "") {
  console.log(`${cond ? "OK  " : "FALHOU"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) process.exitCode = 1;
}

const setup = await submit("/setup", { token: "setup-local-teste", email: EMAIL, password: PASS, areaName: "Principal" });
check("setup cria admin + área", setup.status === 303 || /setup=ok/.test(setup.location ?? "") || /já foi concluído/.test(setup.html), `${setup.status} ${setup.location ?? ""}`);

const bad = await submit("/login", { email: EMAIL, password: "errada-123" });
check("login com senha errada é recusado", /incorretos/.test(bad.html), `${bad.status}`);

const login = await submit("/login", { email: EMAIL, password: PASS });
check("login com senha certa", /axds_session=/.test(cookie), `${login.status} ${login.location ?? ""}`);

for (const p of ["/dashboard", "/vendas", "/financeiro", "/campanhas", "/disparos", "/integracoes", "/configuracoes", "/regras", "/admin", "/geo", "/criativos", "/ga4", "/vturb"]) {
  const r = await get(p);
  check(`GET ${p}`, r.status === 200, `${r.status} ${r.location ?? ""}`);
}

const sales = await get("/api/sales/latest?area=x");
check("feed de vendas (polling) com sessão", sales.status === 200, String(sales.status));

const out = await fetch(BASE + "/dashboard", { redirect: "manual" });
check("sem cookie → /login", out.status === 307 && /\/login/.test(out.headers.get("location") ?? ""));
