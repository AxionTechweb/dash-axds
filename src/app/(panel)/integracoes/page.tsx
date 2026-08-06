import { Check, CircleDashed } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";

import { Card, CardHeader, CardLabel } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { getPlatform } from "@/lib/checkout/platforms";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

import { CheckoutConnect } from "./checkout-connect";
import { DailySheetsConnect } from "./daily-sheets-connect";
import { MetaConnect, type AccountRow } from "./meta-connect";
import { SheetsConnect } from "./sheets-connect";
import { VturbConnect, type VturbPlayerRow } from "./vturb-connect";

export const metadata: Metadata = { title: "Integrações" };
export const dynamic = "force-dynamic";

/** Base pública da instância (para montar as URLs de webhook). */
async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function IntegracoesPage() {
  const activeArea = await getActiveArea();
  if (!activeArea) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Crie uma área para configurar as integrações.
        </p>
      </Card>
    );
  }

  const supabase = await createClient();
  const baseUrl = await getBaseUrl();

  const [
    { data: accountsData },
    { data: areaRow },
    { data: integrations },
    { data: vturbPlayersData },
    { data: sheetsRow },
    { data: dailySheetsRow },
  ] = await Promise.all([
    supabase
      .from("meta_ad_accounts")
      .select("id, label, ad_account_id, ads_token")
      .eq("area_id", activeArea.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("areas")
      .select("public_token")
      .eq("id", activeArea.id)
      .maybeSingle(),
    supabase
      .from("checkout_integrations")
      .select("plataforma, secret, enabled")
      .eq("area_id", activeArea.id),
    supabase
      .from("vturb_players")
      .select("id, player_id, label")
      .eq("area_id", activeArea.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("google_sheets_integrations")
      .select("spreadsheet_id, service_account_json, template_tab_name, enabled")
      .eq("area_id", activeArea.id)
      .maybeSingle(),
    supabase
      .from("daily_campaign_sheets")
      .select("spreadsheet_id, service_account_json, template_tab_name, enabled")
      .eq("area_id", activeArea.id)
      .maybeSingle(),
  ]);

  const accounts: AccountRow[] = (accountsData ?? []).map((row) => ({
    id: row.id as string,
    label: row.label as string,
    ad_account_id: row.ad_account_id as string,
    // Nunca expomos o ciphertext: só se existe ou não.
    hasToken: Boolean(row.ads_token),
  }));

  const publicToken = (areaRow?.public_token as string) ?? "";

  const configured = (integrations ?? [])
    .filter((row) => row.secret && row.enabled !== false)
    .map((row) => row.plataforma as string);

  const vturbPlayers: VturbPlayerRow[] = (vturbPlayersData ?? []).map((row) => ({
    id: row.id as string,
    playerId: row.player_id as string,
    label: row.label as string,
  }));

  const sheetsOn = Boolean(sheetsRow?.service_account_json && sheetsRow?.enabled !== false);
  const dailySheetsOn = Boolean(
    dailySheetsRow?.service_account_json && dailySheetsRow?.enabled !== false,
  );

  const metaOn = accounts.some((a) => a.hasToken);
  const checkoutOn = configured.length > 0;
  const vturbOn = vturbPlayers.length > 0;

  const connectedLabels = configured
    .map((id) => getPlatform(id)?.label ?? id)
    .join(", ");

  const status = [
    {
      label: metaOn
        ? `Meta conectada · ${accounts.length} conta(s)`
        : "Conectar conta de anúncios da Meta",
      done: metaOn,
    },
    {
      label: checkoutOn
        ? `Checkout conectado · ${connectedLabels}`
        : "Conectar a plataforma de checkout",
      done: checkoutOn,
    },
    {
      label: vturbOn
        ? `Vturb conectada · ${vturbPlayers.length} vídeo(s)`
        : "Conectar a Vturb (opcional, pro relatório semanal)",
      done: vturbOn,
    },
    {
      label: sheetsOn
        ? "Google Sheets conectado · relatório semanal"
        : "Conectar o Google Sheets (opcional, pro relatório semanal)",
      done: sheetsOn,
    },
    {
      label: dailySheetsOn
        ? "Google Sheets conectado · checkpoints diários"
        : "Conectar o Google Sheets (opcional, pros checkpoints diários)",
      done: dailySheetsOn,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="display-title text-3xl text-foreground md:text-4xl">
          Integrações
        </h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Duas conexões e o painel funciona: a{" "}
          <strong className="text-foreground">Meta</strong> traz o gasto dos
          anúncios, o <strong className="text-foreground">checkout</strong> traz
          as vendas. Tudo vale para a área{" "}
          <strong className="text-foreground">{activeArea.nome}</strong>, e os
          segredos são cifrados antes de ir para o banco.
        </p>
      </div>

      {/* Status enxuto — duas linhas, nada mais */}
      <Card className="p-5">
        <ul className="space-y-2.5">
          {status.map((item) => (
            <li key={item.label} className="flex items-center gap-2.5 text-sm">
              {item.done ? (
                <Check className="size-4 shrink-0 text-primary" />
              ) : (
                <CircleDashed className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className={cn(item.done && "text-muted-foreground")}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {/* 1 — Meta Ads */}
      <Card>
        <CardHeader>
          <CardLabel>Meta Ads</CardLabel>
          <span className="micro-label">leitura de insights</span>
        </CardHeader>
        <MetaConnect accounts={accounts} />
      </Card>

      {/* 2 — Checkout */}
      <Card>
        <CardHeader>
          <CardLabel>Checkout</CardLabel>
          <span className="micro-label">webhooks de compra</span>
        </CardHeader>
        <CheckoutConnect
          baseUrl={baseUrl}
          publicToken={publicToken}
          configured={configured}
        />
      </Card>

      {/* 3 — Vturb (opcional) */}
      <Card>
        <CardHeader>
          <CardLabel>Vturb</CardLabel>
          <span className="micro-label">métricas de VSL · relatório semanal</span>
        </CardHeader>
        <VturbConnect players={vturbPlayers} />
      </Card>

      {/* 4 — Google Sheets (opcional) */}
      <Card>
        <CardHeader>
          <CardLabel>Google Sheets</CardLabel>
          <span className="micro-label">destino do relatório semanal</span>
        </CardHeader>
        <SheetsConnect
          connected={sheetsOn}
          spreadsheetId={(sheetsRow?.spreadsheet_id as string) ?? null}
          templateTabName={(sheetsRow?.template_tab_name as string) ?? "TEMPLATE"}
        />
      </Card>

      {/* 5 — Google Sheets: checkpoints diários (opcional) */}
      <Card>
        <CardHeader>
          <CardLabel>Google Sheets — checkpoints diários</CardLabel>
          <span className="micro-label">campanhas ativas · a cada ~2h</span>
        </CardHeader>
        <DailySheetsConnect
          baseUrl={baseUrl}
          connected={dailySheetsOn}
          spreadsheetId={(dailySheetsRow?.spreadsheet_id as string) ?? null}
          templateTabName={(dailySheetsRow?.template_tab_name as string) ?? "TEMPLATE"}
        />
      </Card>
    </div>
  );
}
