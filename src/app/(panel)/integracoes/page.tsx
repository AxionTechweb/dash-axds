import { Check, CircleDashed } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";

import { Card } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { cn } from "@/lib/utils";

import {
  AccountsManager,
  CopyBox,
  SettingsForm,
  WebhookSecretForm,
  type AccountRow,
} from "./integration-forms";

export const metadata: Metadata = { title: "Integrações" };
export const dynamic = "force-dynamic";

/** Base pública da instância (para montar snippet e URLs de webhook). */
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

  const [{ data: settings }, { data: accountsData }, { data: areaRow }] =
    await Promise.all([
      supabase
        .from("settings")
        .select(
          "currency, tax_rate, revenue_goal, allowed_origins, hotmart_hottok, kiwify_webhook_token",
        )
        .eq("area_id", activeArea.id)
        .maybeSingle(),
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
    ]);

  const accounts: AccountRow[] = (accountsData ?? []).map((row) => ({
    id: row.id as string,
    label: row.label as string,
    ad_account_id: row.ad_account_id as string,
    // Nunca expomos o ciphertext: só se existe ou não.
    hasToken: Boolean(row.ads_token),
  }));

  const publicToken = (areaRow?.public_token as string) ?? "";
  const origins = (settings?.allowed_origins as string[]) ?? [];

  const checklist = [
    {
      label: "Conta de anúncio da Meta conectada",
      done: accounts.some((a) => a.hasToken),
    },
    { label: "Origens permitidas (CORS) cadastradas", done: origins.length > 0 },
    { label: "Webhook da Hotmart configurado", done: Boolean(settings?.hotmart_hottok) },
    { label: "Webhook da Kiwify configurado", done: Boolean(settings?.kiwify_webhook_token) },
  ];

  const snippet = `<script src="${baseUrl}/track.js" data-area="${publicToken}" defer></script>`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Integrações</h2>
        <p className="text-sm text-muted-foreground">
          Tudo aqui vale para a área <strong>{activeArea.nome}</strong>. Os
          segredos são cifrados antes de ir para o banco.
        </p>
      </div>

      {/* Checklist de onboarding */}
      <Card className="p-4">
        <p className="mb-3 text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
          O que falta conectar
        </p>
        <ul className="space-y-2">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-sm">
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

      {/* Snippet + URLs de webhook */}
      <Card>
        <div className="border-b border-border p-4">
          <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Instalação
          </span>
        </div>
        <div className="space-y-4 p-4">
          <CopyBox label="Snippet das landing pages" value={snippet} />
          <CopyBox
            label="URL do webhook — Hotmart"
            value={`${baseUrl}/api/webhook/hotmart?a=${publicToken}`}
          />
          <CopyBox
            label="URL do webhook — Kiwify"
            value={`${baseUrl}/api/webhook/kiwify?a=${publicToken}`}
          />
          <p className="text-[0.7rem] text-muted-foreground">
            Nos anúncios da Meta, use{" "}
            <code className="font-mono">utm_content=&#123;&#123;ad.id&#125;&#125;</code>{" "}
            para que a atribuição por anúncio funcione.
          </p>
        </div>
      </Card>

      {/* Contas da Meta */}
      <Card>
        <div className="border-b border-border p-4">
          <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Contas de anúncio da Meta
          </span>
        </div>
        <AccountsManager accounts={accounts} />
      </Card>

      {/* Webhooks */}
      <Card>
        <div className="border-b border-border p-4">
          <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Webhooks de compra
          </span>
        </div>
        <div className="grid grid-cols-1 gap-6 p-4 md:grid-cols-2">
          <WebhookSecretForm
            platform="hotmart"
            label="Hottok da Hotmart"
            configured={Boolean(settings?.hotmart_hottok)}
            hint="Cole o hottok da sua conta"
          />
          <WebhookSecretForm
            platform="kiwify"
            label="Token do webhook da Kiwify"
            configured={Boolean(settings?.kiwify_webhook_token)}
            hint="Cole o token de assinatura"
          />
        </div>
      </Card>

      {/* Preferências da área */}
      <Card>
        <div className="border-b border-border p-4">
          <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Preferências da área
          </span>
        </div>
        <SettingsForm
          currency={(settings?.currency as string) ?? DEFAULT_SETTINGS.currency}
          taxRate={Number(settings?.tax_rate ?? DEFAULT_SETTINGS.tax_rate)}
          revenueGoal={Number(
            settings?.revenue_goal ?? DEFAULT_SETTINGS.revenue_goal,
          )}
          allowedOrigins={origins}
        />
      </Card>
    </div>
  );
}
