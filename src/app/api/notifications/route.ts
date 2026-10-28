import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Últimos avisos do sino do painel (template aprovado etc.). Exige sessão. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_log")
    .select("id, created_at, details")
    .eq("action", "notify.inapp")
    .order("created_at", { ascending: false })
    .limit(15);

  return NextResponse.json(
    {
      items: (data ?? []).map((row) => {
        const d = (row.details ?? {}) as { title?: string; body?: string; url?: string };
        return {
          id: row.id as string,
          createdAt: row.created_at as string,
          title: d.title ?? "",
          body: d.body ?? "",
          url: d.url ?? "/dashboard",
        };
      }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
