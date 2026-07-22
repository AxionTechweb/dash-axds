#!/usr/bin/env node
/**
 * Seed OPCIONAL de dados de exemplo — para explorar a interface antes de ter
 * tráfego real. NUNCA roda automaticamente e NUNCA é chamado pelo build.
 *
 *   node scripts/seed.mjs           insere dados de exemplo na primeira área
 *   node scripts/seed.mjs --clear   remove os dados de exemplo
 *
 * Tudo que ele cria é fictício e marcado com o prefixo SEED_ no transaction_id,
 * então dá para remover sem tocar em dado real.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SEED_PREFIX = "SEED_";

// Carrega .env.local sem depender de pacote externo.
function loadEnv() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const value = match[2].replace(/^["']|["']$/g, "");
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  } catch {
    // sem .env.local: assume variáveis já exportadas no ambiente
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (.env.local).",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const clear = process.argv.includes("--clear");

const { data: areas, error: areaError } = await supabase
  .from("areas")
  .select("id, nome")
  .order("created_at", { ascending: true })
  .limit(1);

if (areaError || !areas?.length) {
  console.error(
    "Nenhuma área encontrada. Rode o /setup antes de usar o seed.",
    areaError?.message ?? "",
  );
  process.exit(1);
}

const area = areas[0];

if (clear) {
  const { error } = await supabase
    .from("purchases")
    .delete()
    .eq("area_id", area.id)
    .like("transaction_id", `${SEED_PREFIX}%`);

  await supabase.from("visitors").delete().eq("area_id", area.id).like("user_id", "seed%");
  await supabase.from("events_log").delete().eq("area_id", area.id).like("user_id", "seed%");

  if (error) {
    console.error("Falha ao limpar:", error.message);
    process.exit(1);
  }
  console.log(`Dados de exemplo removidos da área "${area.nome}".`);
  process.exit(0);
}

const PRODUCTS = ["Curso Exemplo", "Mentoria Exemplo", "Ebook Exemplo"];
const REGIONS = [
  ["BR", "SP", "São Paulo"],
  ["BR", "RJ", "Rio de Janeiro"],
  ["BR", "MG", "Belo Horizonte"],
  ["PT", "11", "Lisboa"],
];
const AD_IDS = ["120210000000001", "120210000000002", "120210000000003"];

const randomOf = (list) => list[Math.floor(Math.random() * list.length)];

const visitors = [];
const events = [];
const purchases = [];
const now = Date.now();

for (let i = 0; i < 60; i++) {
  const userId = `seed${String(i).padStart(4, "0")}xxxxxxxx`.slice(0, 16);
  const [country, region, city] = randomOf(REGIONS);
  const adId = randomOf(AD_IDS);
  const daysAgo = Math.floor(Math.random() * 14);
  const createdAt = new Date(now - daysAgo * 86_400_000).toISOString();

  visitors.push({
    area_id: area.id,
    user_id: userId,
    email: `visitante${i}@exemplo.com`,
    utm_source: "facebook",
    utm_medium: "cpc",
    utm_campaign: "campanha-exemplo",
    utm_content: adId,
    geo_country: country,
    geo_region: region,
    geo_city: city,
    created_at: createdAt,
  });

  events.push({
    area_id: area.id,
    user_id: userId,
    event_name: "page_view",
    utm_source: "facebook",
    utm_content: adId,
    geo_country: country,
    geo_region: region,
    geo_city: city,
    created_at: createdAt,
  });

  // ~40% chega ao checkout
  if (Math.random() < 0.4) {
    events.push({
      area_id: area.id,
      user_id: userId,
      event_name: "initiate_checkout",
      utm_source: "facebook",
      utm_content: adId,
      geo_country: country,
      geo_region: region,
      geo_city: city,
      created_at: createdAt,
    });

    // ~55% dos checkouts viram compra
    if (Math.random() < 0.55) {
      const roll = Math.random();
      const status =
        roll < 0.85 ? "approved" : roll < 0.93 ? "pending" : "refunded";

      purchases.push({
        area_id: area.id,
        transaction_id: `${SEED_PREFIX}${i}`,
        user_id: userId,
        email: `visitante${i}@exemplo.com`,
        produto: randomOf(PRODUCTS),
        valor: Number((Math.random() * 400 + 97).toFixed(2)),
        moeda: "BRL",
        status,
        plataforma: Math.random() < 0.5 ? "hotmart" : "kiwify",
        utm_source: "facebook",
        utm_campaign: "campanha-exemplo",
        utm_content: adId,
        ad_id: adId,
        geo_country: country,
        geo_region: region,
        geo_city: city,
        match: "user_id",
        raw_webhook: { seed: true },
        created_at: createdAt,
      });
    }
  }
}

for (const [table, rows] of [
  ["visitors", visitors],
  ["events_log", events],
  ["purchases", purchases],
]) {
  const { error } = await supabase.from(table).upsert(rows);
  if (error) {
    console.error(`Falha ao inserir em ${table}:`, error.message);
    process.exit(1);
  }
  console.log(`  ${table}: ${rows.length} linhas`);
}

console.log(
  `\nDados de exemplo inseridos na área "${area.nome}". Para remover: node scripts/seed.mjs --clear`,
);
