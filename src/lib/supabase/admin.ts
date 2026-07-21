import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getServiceRoleKey, SUPABASE_URL } from "@/lib/env";

/**
 * Cliente Supabase com service_role — SOMENTE no servidor.
 * Faz BYPASS de RLS: use apenas em endpoints públicos (captura/webhooks),
 * Server Actions de escrita e rotinas do servidor. NUNCA exponha ao client.
 */
export function createAdminClient() {
  return createSupabaseClient(SUPABASE_URL, getServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
