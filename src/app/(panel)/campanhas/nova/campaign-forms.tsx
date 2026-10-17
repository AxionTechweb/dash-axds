"use client";

import { ImagePlus, Loader2, Plus, Rocket, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  CTA_OPTIONS,
  DEFAULT_URL_TAGS,
  GOAL_OPTIONS,
  type CampaignGoal,
} from "@/lib/meta/create-config";

import {
  createCampaignAction,
  uploadAdImageAction,
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

type CreativeDraft = {
  key: number;
  file: File | null;
  primaryText: string;
  headline: string;
  cta: string;
  adName: string;
};

const TEXTAREA_CLASS =
  "w-full rounded-xl border border-border bg-[hsl(var(--foreground)/0.02)] p-3 text-sm focus-visible:border-[hsl(var(--primary)/0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

let creativeKey = 0;

function newCreative(base?: CreativeDraft, file: File | null = null): CreativeDraft {
  creativeKey += 1;
  return {
    key: creativeKey,
    file,
    // Novo criativo herda os textos do anterior (caso comum: mesma copy, imagem diferente).
    primaryText: base?.primaryText ?? "",
    headline: base?.headline ?? "",
    cta: base?.cta ?? "LEARN_MORE",
    adName: "",
  };
}

/** Formulário + botão "Criar outra campanha" que zera tudo para a próxima. */
export function CreateCampaignForm(props: {
  accountId: string;
  currency: string | null;
  pages: Option[];
  pixels: Option[];
}) {
  const [round, setRound] = useState(0);
  return <CreateCampaignFormInner key={round} {...props} onAnother={() => setRound((r) => r + 1)} />;
}

function CreateCampaignFormInner({
  accountId,
  currency,
  pages,
  pixels,
  onAnother,
}: {
  accountId: string;
  currency: string | null;
  pages: Option[];
  pixels: Option[];
  onAnother: () => void;
}) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createCampaignAction, {});
  const [goal, setGoal] = useState<CampaignGoal>("sales");
  const [active, setActive] = useState(false);
  const [creatives, setCreatives] = useState<CreativeDraft[]>(() => [newCreative()]);
  const [progress, setProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const needsPixel = goal === "sales" || goal === "leads";
  const busy = pending || progress !== null;

  const update = (key: number, patch: Partial<CreativeDraft>) =>
    setCreatives((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const picked = Array.from(files);
    setCreatives((list) => {
      const last = list[list.length - 1];
      // Se o último criativo ainda está sem imagem, a primeira imagem entra nele.
      const startsOnLast = Boolean(last && !last.file);
      const next = startsOnLast ? [...list.slice(0, -1), { ...last, file: picked[0] }] : [...list];
      picked
        .slice(startsOnLast ? 1 : 0)
        .forEach((file) => next.push(newCreative(next[next.length - 1], file)));
      return next;
    });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUploadError(null);
    const form = new FormData(event.currentTarget);

    const missing = creatives.findIndex((c) => !c.file);
    if (missing >= 0) {
      setUploadError(`Criativo ${missing + 1}: escolha a imagem.`);
      return;
    }

    if (active) {
      const budget = String(form.get("dailyBudget") ?? "?");
      const ok = window.confirm(
        `Criar e ATIVAR já, com ${creatives.length} anúncio(s)? Orçamento diário: ${currency ?? ""} ${budget}. A campanha começa a gastar assim que a Meta aprovar.`,
      );
      if (!ok) return;
    }

    // Uma imagem por requisição: fica abaixo do limite de corpo da Vercel.
    const payload: Record<string, string>[] = [];
    for (const [index, item] of creatives.entries()) {
      setProgress(`Enviando imagem ${index + 1} de ${creatives.length}…`);
      const upload = new FormData();
      upload.set("accountId", accountId);
      upload.set("image", item.file as File);
      const result = await uploadAdImageAction(upload);
      if (!result.hash) {
        setProgress(null);
        setUploadError(`Criativo ${index + 1}: ${result.error ?? "falha ao enviar a imagem."}`);
        return;
      }
      payload.push({
        imageHash: result.hash,
        primaryText: item.primaryText,
        headline: item.headline,
        cta: item.cta,
        adName: item.adName,
      });
    }

    setProgress(null);
    form.set("creatives", JSON.stringify(payload));
    startTransition(() => action(form));
  };

  return (
    <form onSubmit={submit} className="space-y-5 p-5">
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

      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="micro-label">Criativos ({creatives.length})</p>
          <p className="text-xs text-muted-foreground">
            Cada criativo vira um anúncio. Acima de 50, a campanha ganha conjuntos extras (limite da Meta por conjunto).
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Todos os anúncios saem com os parâmetros de URL:{" "}
          <code className="break-all font-mono text-[0.68rem]">{DEFAULT_URL_TAGS}</code>
        </p>

        {creatives.map((item, index) => (
          <div key={item.key} className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Criativo {index + 1}</p>
              {creatives.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setCreatives((list) => list.filter((c) => c.key !== item.key))}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" /> Remover
                </button>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`c-image-${item.key}`}>Imagem (JPG ou PNG, até 4 MB)</Label>
              <Input
                id={`c-image-${item.key}`}
                type="file"
                accept="image/jpeg,image/png"
                onChange={(event) => update(item.key, { file: event.target.files?.[0] ?? null })}
              />
              {item.file ? <p className="text-xs text-muted-foreground">{item.file.name}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`c-text-${item.key}`}>Texto principal</Label>
              <textarea
                id={`c-text-${item.key}`}
                rows={3}
                maxLength={2000}
                required
                value={item.primaryText}
                onChange={(event) => update(item.key, { primaryText: event.target.value })}
                className={TEXTAREA_CLASS}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor={`c-headline-${item.key}`}>Título</Label>
                <Input
                  id={`c-headline-${item.key}`}
                  maxLength={255}
                  required
                  value={item.headline}
                  onChange={(event) => update(item.key, { headline: event.target.value })}
                />
              </div>
              {goal !== "whatsapp" ? (
                <div className="space-y-2">
                  <Label htmlFor={`c-cta-${item.key}`}>Botão</Label>
                  <select
                    id={`c-cta-${item.key}`}
                    className={SELECT_CLASS}
                    value={item.cta}
                    onChange={(event) => update(item.key, { cta: event.target.value })}
                  >
                    {CTA_OPTIONS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor={`c-adname-${item.key}`}>Nome do anúncio (opcional)</Label>
                <Input
                  id={`c-adname-${item.key}`}
                  maxLength={150}
                  value={item.adName}
                  onChange={(event) => update(item.key, { adName: event.target.value })}
                />
              </div>
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setCreatives((list) => [...list, newCreative(list[list.length - 1])])}
          >
            <Plus className="size-4" /> Adicionar criativo
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ImagePlus className="size-4" />
            Adicionar várias imagens de uma vez
            <input
              type="file"
              accept="image/jpeg,image/png"
              multiple
              className="sr-only"
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      <ActivateToggle active={active} onChange={setActive} />

      <div className="flex flex-wrap items-center gap-3">
        {state.ok ? (
          <Button type="button" variant="primary" onClick={onAnother}>
            <Plus className="size-4" /> Criar outra campanha
          </Button>
        ) : (
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
            {active ? "Criar e ativar" : "Criar pausada"}
          </Button>
        )}
        {progress ? (
          <p className="text-sm text-muted-foreground">{progress}</p>
        ) : pending ? (
          <p className="text-sm text-muted-foreground">Criando campanha com {creatives.length} anúncio(s) na Meta…</p>
        ) : null}
        {uploadError ? (
          <p role="alert" className="text-sm text-destructive">
            {uploadError}
          </p>
        ) : (
          <Result state={state} />
        )}
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
