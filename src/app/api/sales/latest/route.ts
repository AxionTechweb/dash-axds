import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/sales/latest?area=<id>&since=<iso> — vendas aprovadas mais novas
 * que `since` (feed "Vendas em Tempo Real" do dashboard). Exige sessão.
 */
export async function GET(request: Request) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const area = url.searchParams.get("area");
  const since = url.searchParams.get("since");
  if (!area) return NextResponse.json({ sales: [] });

  let q = db
    .from("purchases")
    .select("id, produto, valor, created_at")
    .eq("area_id", area)
    .eq("status", "approved");
  if (since && !Number.isNaN(Date.parse(since))) q = q.gt("created_at", new Date(since).toISOString());
  const { data, error } = await q.order("created_at", { ascending: false }).limit(12);
  if (error) return NextResponse.json({ sales: [] }, { status: 500 });
  return NextResponse.json({ sales: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
