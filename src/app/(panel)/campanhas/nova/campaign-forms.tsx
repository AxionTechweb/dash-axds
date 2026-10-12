"use client";

import { Loader2, Rocket } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { CTA_OPTIONS, GOAL_OPTIONS, type CampaignGoal } from "@/lib/meta/create-config";

import {
  createCampaignAction,
  duplicateCampaignAction,
  type CreateState,
} from "./actions";

type Option = { id: string; name: string };
type CampaignOption = { id: string; name: string; status: string; dailyBudget: number | null };

const SELECT_CLASS =
  "h-10 w-full rounded-xl border border-border bg-[hsl(var(--foreground)/0.02)] px-3 text-sm focus-visible:border-[hsl(var(--primary)/0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

function Result({ state }: { state: CreateState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="text-sm text-primary">
        {state.ok}{" "}
        <Link href="/campanhas" className="underline underline-offset-2">
          Ver em Campanhas
        </Link>
      </p>
    );
  }
  return null;
}

function ActivateToggle({
  active,
  onChange,
}: {
  active: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          checked={active}
          onChange={(event) => onChange(event.target.checked)}
          className="size-4 accent-[hsl(var(--primary))]"
        />
        Ativar assim que criar
      </label>
      <p className="text-xs text-muted-foreground">
        {active
          ? "Vai começar a gastar o orçamento assim que a Meta aprovar o anúncio."
          : "Fica pausada. Nenhum gasto até você ativar em Campanhas."}
      </p>
      <input type="hidden" name="confirmActive" value={active ? "yes" : ""} />
    </div>
  );
}

/* ------------------------------------------------------------- criar do zero */

export function CreateCampaignForm({
  accountId,
  currency,
  pages,
  pixels,
}: {
  accountId: string;
  currency: string | null;
  pages: Option[];
  pixels: Option[];
}) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createCampaignAction, {});
  const [goal, setGoal] = useState<CampaignGoal>("sales");
  const [active, setActive] = useState(false);
  const needsPixel = goal === "sales" || goal === "leads";

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!active) return;
        const form = new FormData(event.currentTarget);
        const budget = String(form.get("dailyBudget") ?? "?");
        const ok = window.confirm(
          `Criar e ATIVAR já? Orçamento diário: ${currency ?? ""} ${budget}. A campanha começa a gastar assim que a Meta aprovar.`,
        );
        if (!ok) event.preventDefault();
      }}
      className="space-y-5 p-5"
    >
      <input type="hidden" name="accountId" value={accountId} />

      <fieldset className="space-y-2">
        <Label>Objetivo</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {GOAL_OPTIONS.map((option) => (
            <label
              key={option.id}
              className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${
                goal === option.id
                  ? "border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.06)]"
                  : "border-border"
              }`}
            >
              <input
                type="radio"
                name="goal"
                value={option.id}
                checked={goal === option.id}
                onChange={() => setGoal(option.id)}
                className="mt-1 size-4 accent-[hsl(var(--primary))]"
              />
              <span>
                <span className="block font-medium">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="c-name">Nome da campanha</Label>
          <Input id="c-name" name="name" maxLength={150} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-budget">Orçamento diário{currency ? ` (${currency})` : ""}</Label>
          <Input id="c-budget" name="dailyBudget" inputMode="decimal" placeholder="50,00" required />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="c-page">Página do Facebook</Label>
          <select id="c-page" name="pageId" className={SELECT_CLASS} required>
            <option value="">Escolha…</option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {needsPixel ? (
          <div className="space-y-2">
            <Label htmlFor="c-pixel">Pixel</Label>
            <select id="c-pixel" name="pixelId" className={SELECT_CLASS} required>
              <option value="">Escolha…</option>
              {pixels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {goal === "whatsapp" ? (
          <div className="space-y-2">
            <Label htmlFor="c-wa">WhatsApp (com DDI e DDD)</Label>
            <Input id="c-wa" name="whatsapp" inputMode="tel" placeholder="5511999998888" required />
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="c-link">Link de destino</Label>
            <Input id="c-link" name="link" type="url" placeholder="https://..." required />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="c-age-min">Idade mín.</Label>
          <Input id="c-age-min" name="ageMin" type="number" min={18} max={65} defaultValue={18} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-age-max">Idade máx.</Label>
          <Input id="c-age-max" name="ageMax" type="number" min={18} max={65} defaultValue={65} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-gender">Gênero</Label>
          <select id="c-gender" name="gender" className={SELECT_CLASS} defaultValue="all">
            <option value="all">Todos</option>
            <option value="female">Mulheres</option>
            <option value="male">Homens</option>
          </select>
        </div>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        Público: Brasil. Segmentação por interesse e públicos salvos você ajusta depois, na Meta.
      </p>

      <div className="space-y-3 rounded-xl border border-border p-4">
        <p className="micro-label">Anúncio</p>
        <div className="space-y-2">
          <Label htmlFor="c-image">Imagem (JPG ou PNG, até 4 MB)</Label>
          <Input id="c-image" name="image" type="file" accept="image/jpeg,image/png" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-text">Texto principal</Label>
          <textarea
            id="c-text"
            name="primaryText"
            rows={3}
            maxLength={2000}
            required
            className="w-full rounded-xl border border-border bg-[hsl(var(--foreground)/0.02)] p-3 text-sm focus-visible:border-[hsl(var(--primary)/0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="c-headline">Título</Label>
            <Input id="c-headline" name="headline" maxLength={255} required />
          </div>
          {goal !== "whatsapp" ? (
            <div className="space-y-2">
              <Label htmlFor="c-cta">Botão</Label>
              <select id="c-cta" name="cta" className={SELECT_CLASS} defaultValue="LEARN_MORE">
                {CTA_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-adname">Nome do anúncio (opcional)</Label>
          <Input id="c-adname" name="adName" maxLength={150} />
        </div>
      </div>

      <ActivateToggle active={active} onChange={setActive} />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
          {active ? "Criar e ativar" : "Criar pausada"}
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}

/* ----------------------------------------------------------------- duplicar */

export function DuplicateCampaignForm({
  accountId,
  currency,
  campaigns,
}: {
  accountId: string;
  currency: string | null;
  campaigns: CampaignOption[];
}) {
  const [state, action, pending] = useActionState<CreateState, FormData>(
    duplicateCampaignAction,
    {},
  );
  const [active, setActive] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const source = campaigns.find((c) => c.id === sourceId);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!active) return;
        const ok = window.confirm("Duplicar e ATIVAR já? A cópia começa a gastar assim que a Meta aprovar.");
        if (!ok) event.preventDefault();
      }}
      className="space-y-5 p-5"
    >
      <input type="hidden" name="accountId" value={accountId} />

      <div className="space-y-2">
        <Label htmlFor="d-source">Campanha de origem</Label>
        <select
          id="d-source"
          name="sourceId"
          value={sourceId}
          onChange={(event) => setSourceId(event.target.value)}
          className={SELECT_CLASS}
          required
        >
          <option value="">Escolha…</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.status === "ACTIVE" ? "ativa" : "pausada"}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Copia a campanha inteira: conjuntos, públicos, criativos e anúncios.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="d-name">Nome da cópia</Label>
          <Input
            id="d-name"
            name="name"
            maxLength={150}
            required
            key={sourceId}
            defaultValue={source ? `${source.name} - cópia` : ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="d-budget">
            Novo orçamento diário{currency ? ` (${currency})` : ""}
          </Label>
          <Input
            id="d-budget"
            name="dailyBudget"
            inputMode="decimal"
            placeholder={
              source?.dailyBudget ? `deixe vazio para manter ${source.dailyBudget}` : "deixe vazio para manter"
            }
          />
        </div>
      </div>

      <ActivateToggle active={active} onChange={setActive} />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending || campaigns.length === 0}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
          {active ? "Duplicar e ativar" : "Duplicar pausada"}
        </Button>
        <Result state={state} />
      </div>
    </form>
  );
}
