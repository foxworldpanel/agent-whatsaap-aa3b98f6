import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";

// Sync the SMM panel catalogue. Calls the SMM API live, updates sync status on
// integrations, and returns the list to the caller. Does NOT persist the whole
// catalogue — it is fetched fresh on demand.
export const syncSmmServices = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
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
      // Persiste no catálogo em cache preservando o flag `hidden` (serviços
      // marcados manualmente como indisponíveis não voltam a aparecer numa
      // nova sincronização).
      try {
        if (list.length > 0) {
          const rows = list.map((s) => ({
            user_id: context.userId,
            service_id: String(s.service),
            nome: s.name ?? "",
            categoria: s.category ?? "",
            preco_por_1000: Number(s.rate) || 0,
            minimo: parseInt(s.min, 10) || 0,
            maximo: parseInt(s.max, 10) || 0,
          }));
          // Upsert em lotes de 500 (preserva `hidden` porque a coluna não é
          // enviada no payload; onConflict apenas atualiza os campos do painel).
          for (let i = 0; i < rows.length; i += 500) {
            await supabaseAdmin
              .from("catalog_cache")
              .upsert(rows.slice(i, i + 500), { onConflict: "user_id,service_id" });
          }
          // Remove serviços que sumiram do painel (não estão mais na resposta).
          const activeIds = rows.map((r) => r.service_id);
          await supabaseAdmin
            .from("catalog_cache")
            .delete()
            .eq("user_id", context.userId)
            .not("service_id", "in", `(${activeIds.map((id) => `"${id.replace(/"/g, '')}"`).join(",")})`);
        } else {
          await supabaseAdmin.from("catalog_cache").delete().eq("user_id", context.userId);
        }
      } catch (e) {
        console.error("catalog_cache persist failed", e);
      }
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

// Lista o catálogo em cache (já sincronizado) para o usuário atual.
export const listCatalogCache = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("catalog_cache")
      .select("service_id, nome, categoria, preco_por_1000, minimo, maximo")
      .eq("user_id", context.userId)
      .order("nome");
    if (error) throw new Error(error.message);
    const services: ServiceRow[] = (data ?? []).map((r) => ({
      service: r.service_id,
      name: r.nome,
      category: r.categoria,
      rate: String(r.preco_por_1000),
      min: String(r.minimo),
      max: String(r.maximo),
    }));
    // Pega meta da última sync
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: integ } = await supabaseAdmin
      .from("integrations")
      .select("smm_last_sync_at, smm_last_sync_count")
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      services,
      last_sync_at: integ?.smm_last_sync_at ?? null,
      last_sync_count: integ?.smm_last_sync_count ?? services.length,
    };
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
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("free_test_services")
      .select("*")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertFreeTestService = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
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
  .middleware([withWorkspaceScope])
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