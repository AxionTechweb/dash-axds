import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardHeader, CardLabel } from "@/components/ui/card";
import { getActiveArea } from "@/lib/areas";
import { getAdAccounts } from "@/lib/meta/client";
import { loadAccountAssets } from "@/lib/meta/create";
import { cn } from "@/lib/utils";

import { CreateCampaignForm, DuplicateCampaignForm } from "./campaign-forms";
import { UrlTagsForm } from "./url-tags-form";

export const metadata: Metadata = { title: "Nova campanha" };
export const dynamic = "force-dynamic";

/** Muitos criativos = muitas chamadas à Meta numa criação só (2 por anúncio). */
export const maxDuration = 300;

type SearchParams = { account?: string; mode?: string };

export default async function NovaCampanhaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const activeArea = await getActiveArea();
  if (!activeArea) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Crie uma área para subir campanhas.</p>
      </Card>
    );
  }

  const accounts = (await getAdAccounts(activeArea.id)).filter((a) => a.ads_token);
  if (accounts.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          Conecte uma conta de anúncio com token em{" "}
          <Link href="/integracoes" className="text-primary underline underline-offset-2">
            Integrações
          </Link>{" "}
          (precisa do escopo <span className="font-mono">ads_management</span>).
        </p>
      </Card>
    );
  }

  const account = accounts.find((a) => a.id === params.account) ?? accounts[0];
  const mode =
    params.mode === "duplicar" ? "duplicar" : params.mode === "parametros" ? "parametros" : "criar";
  const assets = await loadAccountAssets(activeArea.id, account.id);

  const href = (next: Partial<SearchParams>) => {
    const qs = new URLSearchParams({
      account: next.account ?? account.id,
      mode: next.mode ?? mode,
    });
    return `/campanhas/nova?${qs}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 rounded-lg border border-border bg-[hsl(var(--muted)/0.4)] p-1">
          {(
            [
              { id: "criar", label: "Criar do zero" },
              { id: "duplicar", label: "Duplicar existente" },
              { id: "parametros", label: "Parâmetros de URL" },
            ] as const
          ).map((item) => (
            <Link
              key={item.id}
              href={href({ mode: item.id })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                mode === item.id
                  ? "bg-[hsl(var(--primary)/0.15)] font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {accounts.length > 1 ? (
          <nav className="flex flex-wrap gap-1">
            {accounts.map((a) => (
              <Link
                key={a.id}
                href={href({ account: a.id })}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm",
                  a.id === account.id
                    ? "border-[hsl(var(--primary)/0.5)] text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {a.label}
              </Link>
            ))}
          </nav>
        ) : (
          <span className="micro-label">{account.label}</span>
        )}
      </div>

      {assets.error ? (
        <Card className="p-4">
          <p role="alert" className="text-sm text-destructive">
            A Meta devolveu um aviso ao listar os dados da conta: {assets.error}
          </p>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardLabel>
            {mode === "criar" ? "Nova campanha" : mode === "duplicar" ? "Duplicar campanha" : "Parâmetros de URL nos anúncios existentes"}
          </CardLabel>
          <span className="micro-label">
            {account.label}
            {mode === "parametros" ? "" : " · criada pausada por padrão"}
          </span>
        </CardHeader>
        {mode === "parametros" ? (
          <UrlTagsForm accountId={account.id} />
        ) : mode === "criar" ? (
          <CreateCampaignForm
            accountId={account.id}
            currency={assets.currency}
            pages={assets.pages}
            pixels={assets.pixels}
          />
        ) : (
          <DuplicateCampaignForm
            accountId={account.id}
            currency={assets.currency}
            campaigns={assets.campaigns}
          />
        )}
      </Card>
    </div>
  );
}
