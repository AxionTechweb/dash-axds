"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Check, Copy, Plug, Plus, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

import {
  deleteAdAccount,
  saveAdAccount,
  saveSettings,
  saveWebhookSecret,
  testConnection,
  type FormState,
} from "./actions";

function Feedback({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-xs text-destructive">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return <p className="text-xs text-primary">{state.ok}</p>;
  }
  return null;
}

/* ------------------------------------------------------------ settings */

export function SettingsForm({
  currency,
  taxRate,
  revenueGoal,
  allowedOrigins,
}: {
  currency: string;
  taxRate: number;
  revenueGoal: number;
  allowedOrigins: string[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveSettings,
    {},
  );

  return (
    <form action={formAction} className="space-y-4 p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="currency">Moeda</Label>
          <Input
            id="currency"
            name="currency"
            defaultValue={currency}
            maxLength={3}
            required
          />
        </div>
        <div>
          <Label htmlFor="tax_rate">Alíquota de imposto (%)</Label>
          <Input
            id="tax_rate"
            name="tax_rate"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={taxRate}
            required
          />
        </div>
        <div>
          <Label htmlFor="revenue_goal">Meta de faturamento</Label>
          <Input
            id="revenue_goal"
            name="revenue_goal"
            type="number"
            step="0.01"
            min="0"
            defaultValue={revenueGoal}
            required
          />
        </div>
      </div>

      <div>
        <Label htmlFor="allowed_origins">
          Origens permitidas (CORS) — uma por linha
        </Label>
        <textarea
          id="allowed_origins"
          name="allowed_origins"
          rows={4}
          defaultValue={allowedOrigins.join("\n")}
          placeholder={"https://sua-lp.com\n*.seudominio.com"}
          className="w-full rounded-md border border-border bg-[hsl(var(--input)/0.35)] p-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        />
        <p className="mt-1 text-[0.7rem] text-muted-foreground">
          Sem nenhuma origem cadastrada, a captura é <strong>bloqueada</strong>{" "}
          para requisições de navegador.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Feedback state={state} />
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "Salvando..." : "Salvar preferências"}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------- segredos de webhook */

export function WebhookSecretForm({
  platform,
  label,
  configured,
  hint,
}: {
  platform: "hotmart" | "kiwify";
  label: string;
  configured: boolean;
  hint: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveWebhookSecret,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="platform" value={platform} />
      <div>
        <Label htmlFor={`secret-${platform}`}>
          {label}{" "}
          <span
            className={
              configured ? "text-primary" : "text-muted-foreground"
            }
          >
            · {configured ? "configurado" : "não configurado"}
          </span>
        </Label>
        <Input
          id={`secret-${platform}`}
          name="value"
          type="password"
          placeholder={configured ? "••••••••  (deixe vazio para remover)" : hint}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Feedback state={state} />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------ contas de anúncio Meta */

export type AccountRow = {
  id: string;
  label: string;
  ad_account_id: string;
  hasToken: boolean;
};

export function AccountsManager({ accounts }: { accounts: AccountRow[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3 p-4">
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma conta conectada. Sem isso, gasto, ROAS, CPA e a página de
          Campanhas ficam vazios.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {accounts.map((account) => (
            <AccountRowItem key={account.id} account={account} />
          ))}
        </ul>
      )}

      <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Adicionar conta
      </Button>

      <AccountDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function AccountRowItem({ account }: { account: AccountRow }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    deleteAdAccount,
    {},
  );

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{account.label}</p>
        <p className="truncate font-mono text-[0.7rem] text-muted-foreground">
          {account.ad_account_id} · token{" "}
          {account.hasToken ? "••••••••" : "ausente"}
        </p>
        {state.error ? (
          <p className="text-xs text-destructive">{state.error}</p>
        ) : null}
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Editar
        </Button>
        <form action={formAction}>
          <input type="hidden" name="id" value={account.id} />
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            disabled={pending}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            Remover
          </Button>
        </form>
      </div>

      <AccountDialog
        open={editing}
        onOpenChange={setEditing}
        account={account}
      />
    </li>
  );
}

function AccountDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account?: AccountRow;
}) {
  const [saveState, saveAction, saving] = useActionState<FormState, FormData>(
    saveAdAccount,
    {},
  );
  const [testState, testAction, testing] = useActionState<FormState, FormData>(
    testConnection,
    {},
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 shadow-2xl">
          <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
            <Plug className="size-4 text-primary" />
            {account ? "Editar conta" : "Conectar conta da Meta"}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            Use um token de <strong>System User</strong> do Business Manager
            (não expira), com os escopos <code>ads_read</code> e{" "}
            <code>ads_management</code>, vinculado a esta conta de anúncio.
          </Dialog.Description>

          <form className="mt-4 space-y-4">
            {account ? (
              <input type="hidden" name="id" value={account.id} />
            ) : null}

            <div>
              <Label htmlFor="label">Rótulo</Label>
              <Input
                id="label"
                name="label"
                required
                defaultValue={account?.label}
                placeholder="Ex.: Conta principal"
              />
            </div>

            <div>
              <Label htmlFor="ad_account_id">ID da conta de anúncio</Label>
              <Input
                id="ad_account_id"
                name="ad_account_id"
                required
                defaultValue={account?.ad_account_id}
                placeholder="act_1234567890"
              />
            </div>

            <div>
              <Label htmlFor="ads_token">Token de System User</Label>
              <Input
                id="ads_token"
                name="ads_token"
                type="password"
                required
                placeholder={account?.hasToken ? "••••••••  (informe para substituir)" : ""}
              />
            </div>

            <Feedback state={testState} />
            <Feedback state={saveState} />

            <div className="flex justify-between gap-2">
              <Button
                type="submit"
                size="sm"
                variant="outline"
                formAction={testAction}
                disabled={testing}
              >
                <Check className="size-3.5" />
                {testing ? "Testando..." : "Testar conexão"}
              </Button>

              <div className="flex gap-2">
                <Dialog.Close asChild>
                  <Button type="button" size="sm" variant="ghost">
                    Cancelar
                  </Button>
                </Dialog.Close>
                <Button
                  type="submit"
                  size="sm"
                  variant="primary"
                  formAction={saveAction}
                  disabled={saving}
                >
                  {saving ? "Validando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* -------------------------------------------------------------- copiar */

export function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            navigator.clipboard.writeText(value).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => setCopied(false),
            );
          }}
        >
          {copied ? (
            <Check className="size-3.5 text-primary" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-md border border-border bg-[hsl(var(--muted)/0.4)] p-3 font-mono text-[0.7rem] text-muted-foreground">
        {value}
      </pre>
    </div>
  );
}
