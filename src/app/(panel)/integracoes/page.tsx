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

  const hotmartOn = Boolean(settings?.hotmart_hottok);
  const kiwifyOn = Boolean(settings?.kiwify_webhook_token);

  // Cada instância usa um checkout só (ou os dois). Enquanto nenhum estiver
  // configurado, cobramos os dois; assim que um entra, o outro vira opcional.
  const anyCheckout = hotmartOn || kiwifyOn;

  const checklist = [
    {
      label: "Conta de anúncio da Meta conectada",
      done: accounts.some((a) => a.hasToken),
    },
    {
      label: "Webhook da Hotmart configurado",
      done: hotmartOn,
      optional: anyCheckout && !hotmartOn,
    },
    {
      label: "Webhook da Kiwify configurado",
      done: kiwifyOn,
      optional: anyCheckout && !kiwifyOn,
    },
    {
      label: "Origens permitidas (CORS) cadastradas",
      done: origins.length > 0,
      // Só importa para quem usa a captura própria (snippet). Com as UTMs
      // chegando pelo checkout, o painel funciona sem nenhuma origem.
      optional: true,
    },
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
              {!item.done && item.optional ? (
                <span className="text-[0.68rem] text-muted-foreground">
                  opcional
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {/* URLs de webhook + como o ad_id chega ao checkout */}
      <Card>
        <div className="border-b border-border p-4">
          <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Instalação
          </span>
        </div>
        <div className="space-y-4 p-4">
          <CopyBox
            label="URL do webhook — Hotmart"
            value={`${baseUrl}/api/webhook/hotmart?a=${publicToken}`}
          />
          <CopyBox
            label="URL do webhook — Kiwify"
            value={`${baseUrl}/api/webhook/kiwify?a=${publicToken}`}
          />
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Como a atribuição chega até aqui
            </p>
            <ol className="ml-4 list-decimal space-y-1 text-[0.72rem] text-muted-foreground">
              <li>
                Nos anúncios da Meta, use{" "}
                <code className="font-mono text-foreground">
                  utm_content=&#123;&#123;ad.id&#125;&#125;
                </code>{" "}
                na URL.
              </li>
              <li>
                O código de rastreio do seu site propaga esse valor para o link
                do checkout: <code className="font-mono text-foreground">src</code>{" "}
                na Hotmart,{" "}
                <code className="font-mono text-foreground">utm_content</code> na
                Kiwify.
              </li>
              <li>
                O webhook devolve o parâmetro e o painel grava em{" "}
                <code className="font-mono text-foreground">ad_id</code>. O
                cruzamento com a Meta é sempre por ID exato.
              </li>
            </ol>
            <p className="mt-2 text-[0.7rem] text-muted-foreground">
              O <code className="font-mono">ad_id</code> só é aceito se for
              numérico. Se o checkout não devolver o parâmetro, a venda ainda é
              gravada — apenas sem anúncio atribuído.
            </p>
          </div>
        </div>
      </Card>

      {/* Captura própria — opcional */}
      <Card>
        <div className="border-b border-border p-4">
          <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Captura própria (opcional)
          </span>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-[0.72rem] text-muted-foreground">
            Só se você quiser que <strong>este painel</strong> também rastreie as
            visitas. Habilita checkouts iniciados, funil e regiões por visitante.
            Se as UTMs já chegam ao checkout por um código externo, você{" "}
            <strong>não precisa disto</strong> — a atribuição por anúncio
            funciona sem.
          </p>
          <CopyBox label="Snippet das landing pages" value={snippet} />
          <p className="text-[0.7rem] text-muted-foreground">
            Usando o snippet, cadastre também os domínios em{" "}
            <strong>Origens permitidas</strong> logo abaixo — sem eles a captura
            é bloqueada de propósito.
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
