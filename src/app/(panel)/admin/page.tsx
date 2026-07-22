import type { Metadata } from "next";

import { Card } from "@/components/ui/card";
import { getAreas } from "@/lib/areas";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { InviteForm, RemoveUserButton } from "./admin-forms";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

type PanelUser = {
  id: string;
  email: string;
  lastSignIn: string | null;
  createdAt: string;
};

async function listPanelUsers(): Promise<PanelUser[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 100,
    });
    if (error || !data) return [];

    return data.users.map((u) => ({
      id: u.id,
      email: u.email ?? "—",
      lastSignIn: u.last_sign_in_at ?? null,
      createdAt: u.created_at,
    }));
  } catch {
    return [];
  }
}

export default async function AdminPage() {
  const [currentUser, users, areas] = await Promise.all([
    getCurrentUser(),
    listPanelUsers(),
    getAreas(),
  ]);

  const supabase = await createClient();
  const { data: auditLog } = await supabase
    .from("audit_log")
    .select("id, created_at, actor_email, action, target_type, target_id, details")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Admin</h2>
        <p className="text-sm text-muted-foreground">
          Usuários do painel, áreas e log de auditoria.
        </p>
      </div>

      <Card>
        <div className="border-b border-border p-4">
          <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Usuários do painel
          </span>
        </div>

        <InviteForm />

        {users.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            Não foi possível listar os usuários (verifique a chave de service
            role).
          </p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {users.map((user) => (
              <li
                key={user.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    {user.email}
                    {user.id === currentUser?.id ? (
                      <span className="ml-2 rounded-full border border-primary/40 bg-[hsl(var(--primary)/0.12)] px-2 py-0.5 text-[0.62rem] text-primary">
                        você
                      </span>
                    ) : null}
                  </p>
                  <p className="font-mono text-[0.68rem] text-muted-foreground">
                    {user.lastSignIn
                      ? `último acesso ${new Date(user.lastSignIn).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`
                      : "nunca acessou"}
                  </p>
                </div>
                <RemoveUserButton
                  userId={user.id}
                  isSelf={user.id === currentUser?.id}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="border-b border-border p-4">
          <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Áreas
          </span>
        </div>
        <ul className="divide-y divide-border">
          {areas.map((area) => (
            <li
              key={area.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
            >
              <span className="truncate">{area.nome}</span>
              <span className="font-mono text-[0.68rem] text-muted-foreground">
                criada em{" "}
                {new Date(area.created_at).toLocaleDateString("pt-BR")}
              </span>
            </li>
          ))}
        </ul>
        <p className="px-4 py-3 text-[0.7rem] text-muted-foreground">
          Criar, renomear e excluir áreas em <strong>Configurações</strong>.
        </p>
      </Card>

      <Card>
        <div className="border-b border-border p-4">
          <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Log de auditoria
          </span>
        </div>

        {!auditLog?.length ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Nenhum registro ainda. Escritas na Meta, execuções de regras e
            mudanças de configuração aparecem aqui.
          </p>
        ) : (
          <div className="max-h-[32rem] overflow-y-auto">
            <ul className="divide-y divide-border">
              {auditLog.map((entry) => (
                <li key={entry.id as string} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-mono text-xs text-primary">
                      {entry.action as string}
                    </span>
                    <span className="font-mono text-[0.68rem] text-muted-foreground">
                      {new Date(entry.created_at as string).toLocaleString(
                        "pt-BR",
                        { dateStyle: "short", timeStyle: "short" },
                      )}
                    </span>
                  </div>
                  <p className="truncate text-[0.7rem] text-muted-foreground">
                    {(entry.actor_email as string) ?? "sistema (cron)"}
                    {entry.target_id ? ` · ${entry.target_id as string}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
