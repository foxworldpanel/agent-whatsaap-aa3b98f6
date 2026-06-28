import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Sync the SMM panel catalogue. Calls the SMM API live, updates sync status on
// integrations, and returns the list to the caller. Does NOT persist the whole
// catalogue — it is fetched fresh on demand.
export const syncSmmServices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: integ, error: ie } = await supabaseAdmin
      .from("integrations")
      .select("smm_api_key, smm_panel_url")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (ie) throw new Error(ie.message);
    const key = integ?.smm_api_key?.trim();
    const url = (integ?.smm_panel_url?.trim() || "https://mindsmmpanel.com/smmpanel/api/v1");
    if (!key) {
      const msg = "API Key do painel SMM não configurada";
      await supabaseAdmin.from("integrations").update({
        smm_last_sync_at: new Date().toISOString(),
        smm_last_sync_count: 0,
        smm_last_sync_error: msg,
      }).eq("user_id", context.userId);
      return { ok: false, count: 0, error: msg, services: [] as ServiceRow[] };
    }
    try {
      const { smmFetchServices } = await import("@/lib/smm.server");
      const list = await smmFetchServices({ url, key });
      await supabaseAdmin.from("integrations").update({
        smm_last_sync_at: new Date().toISOString(),
        smm_last_sync_count: list.length,
        smm_last_sync_error: null,
      }).eq("user_id", context.userId);
      return { ok: true, count: list.length, error: null, services: list };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin.from("integrations").update({
        smm_last_sync_at: new Date().toISOString(),
        smm_last_sync_count: 0,
        smm_last_sync_error: msg,
      }).eq("user_id", context.userId);
      return { ok: false, count: 0, error: msg, services: [] as ServiceRow[] };
    }
  });

export type ServiceRow = {
  service: string;
  name: string;
  category: string;
  rate: string;
  min: string;
  max: string;
};

export const listFreeTestServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("free_test_services")
      .select("*")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertFreeTestService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      service_id: z.string().min(1).max(50),
      service_name: z.string().max(500).optional(),
      category: z.string().max(200).optional(),
      quantity: z.number().int().min(1).max(1_000_000),
      enabled: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("free_test_services")
      .upsert(
        {
          user_id: context.userId,
          service_id: data.service_id,
          service_name: data.service_name ?? "",
          category: data.category ?? "",
          quantity: data.quantity,
          enabled: data.enabled,
        },
        { onConflict: "user_id,service_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFreeTestService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ service_id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("free_test_services")
      .delete()
      .eq("user_id", context.userId)
      .eq("service_id", data.service_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });