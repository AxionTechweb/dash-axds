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
import { Ga4Connect } from "./ga4-connect";
import { CopyBox } from "./integration-forms";
import { MetaConnect, type AccountRow } from "./meta-connect";
import { SheetsConnect } from "./sheets-connect";
import { UmblerConnect } from "./umbler-connect";
import { VturbConnect, type VturbPlayerRow } from "./vturb-connect";
import { WhatsappConnect } from "./whatsapp-connect";

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
    { data: ga4Row },
    { data: whatsappRow },
    { data: umblerRow },
  ] = await Promise.all([
    supabase
      .from("meta_ad_accounts")
      .select("id, label, ad_account_id, ads_token, alerts_muted")
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
    supabase
      .from("ga4_integrations")
      .select("property_id, service_account_json, enabled")
      .eq("area_id", activeArea.id)
      .maybeSingle(),
    supabase
      .from("whatsapp_integrations")
      .select("base_url, instance, api_key, target_number, enabled")
      .eq("area_id", activeArea.id)
      .maybeSingle(),
    supabase
      .from("umbler_integrations")
      .select("api_token, organization_id, enabled")
      .eq("area_id", activeArea.id)
      .maybeSingle(),
  ]);

  const accounts: AccountRow[] = (accountsData ?? []).map((row) => ({
    id: row.id as string,
    label: row.label as string,
    ad_account_id: row.ad_account_id as string,
    // Nunca expomos o ciphertext: só se existe ou não.
    hasToken: Boolean(row.ads_token),
    alertsMuted: Boolean(row.alerts_muted),
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
  const ga4On = Boolean(ga4Row?.service_account_json && ga4Row?.enabled !== false);
  const whatsappOn = Boolean(whatsappRow?.api_key && whatsappRow?.enabled !== false);
  const umblerOn = Boolean(umblerRow?.api_token && umblerRow?.enabled !== false);

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
    {
      label: ga4On
        ? "GA4 conectado · página /ga4 no painel"
        : "Conectar o GA4 (opcional, pra página /ga4 no painel)",
      done: ga4On,
    },
    {
      label: whatsappOn
        ? "WhatsApp conectado · avisos de venda/conta/regras"
        : "Conectar o WhatsApp (opcional, pros avisos automáticos)",
      done: whatsappOn,
    },
    {
      label: umblerOn
        ? "Umbler Talk conectada · página /umbler no painel"
        : "Conectar a Umbler Talk (opcional, pra página /umbler no painel)",
      done: umblerOn,
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

      {/* 3 — Rastreamento próprio (opcional) — vira a aba "Eventos" de /vendas */}
      <Card>
        <CardHeader>
          <CardLabel>Rastreamento — jornada do lead</CardLabel>
          <span className="micro-label">page view · checkout · aba Eventos em /vendas</span>
        </CardHeader>
        <div className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">
            Sem captura própria, a aba <strong>Eventos</strong> de{" "}
            <strong>Vendas</strong> fica vazia — não tem como saber quantas
            vezes um visitante entrou na página nem juntar isso com a compra.
            Se o rastreamento é feito pelo GTM, adicione uma tag do tipo{" "}
            <strong>HTML personalizado</strong>, gatilho{" "}
            <strong>Todas as páginas</strong>, com o conteúdo abaixo — ele gera
            o identificador anônimo do visitante (o &quot;SRC&quot; da jornada),
            registra os acessos e decora automaticamente o link de checkout
            (Hotmart/Kiwify) para a compra casar com esse mesmo visitante.
          </p>
          <div className="rounded-lg border border-[hsl(var(--accent-amber)/0.25)] bg-[hsl(var(--accent-amber)/0.06)] p-3">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">
                Seu GTM já gera um ID de visitante próprio (cookie/localStorage)?
              </strong>{" "}
              Não instale a tag abaixo como está — ela criaria um SEGUNDO
              identificador, diferente do que você já usa, e os dois não vão
              casar (page views de um lado, compra do outro). Nesse caso, o
              ajuste certo é reaproveitar o ID que seu script já gera, não
              instalar este aqui por cima.
            </p>
          </div>
          <CopyBox
            label="Tag HTML personalizado — GTM (sem gerador de ID próprio)"
            value={
              `<script src="${baseUrl}/track.js" data-area="${publicToken}" defer>` +
              "</script>"
            }
          />
          <p className="text-xs text-muted-foreground">
            Eventos extras (ex.: ViewContent, Lead) podem ser disparados nos
            gatilhos que o GTM já tem, chamando{" "}
            <code className="font-mono text-foreground">
              window.tracker.track(&quot;nome_do_evento&quot;)
            </code>{" "}
            numa tag de HTML personalizado.
          </p>
        </div>
      </Card>

      {/* 4 — Vturb (opcional) */}
      <Card>
        <CardHeader>
          <CardLabel>Vturb</CardLabel>
          <span className="micro-label">métricas de VSL · relatório semanal</span>
        </CardHeader>
        <VturbConnect players={vturbPlayers} />
      </Card>

      {/* 5 — Google Sheets (opcional) */}
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

      {/* 6 — Google Sheets: checkpoints diários (opcional) */}
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

      {/* 7 — GA4 (opcional) */}
      <Card>
        <CardHeader>
          <CardLabel>GA4</CardLabel>
          <span className="micro-label">página de destino · painel /ga4</span>
        </CardHeader>
        <Ga4Connect
          connected={ga4On}
          propertyId={(ga4Row?.property_id as string) ?? null}
        />
      </Card>

      {/* 8 — WhatsApp (opcional) */}
      <Card>
        <CardHeader>
          <CardLabel>WhatsApp — avisos</CardLabel>
          <span className="micro-label">Evolution API · vendas · contas · regras</span>
        </CardHeader>
        <WhatsappConnect
          connected={whatsappOn}
          baseUrl={(whatsappRow?.base_url as string) ?? null}
          instance={(whatsappRow?.instance as string) ?? null}
          targetNumber={(whatsappRow?.target_number as string) ?? null}
        />
      </Card>

      {/* 9 — Umbler Talk (opcional) */}
      <Card>
        <CardHeader>
          <CardLabel>Umbler Talk</CardLabel>
          <span className="micro-label">chats · contatos · templates · painel /umbler</span>
        </CardHeader>
        <UmblerConnect
          connected={umblerOn}
          organizationId={(umblerRow?.organization_id as string) ?? null}
        />
      </Card>
    </div>
  );
}
