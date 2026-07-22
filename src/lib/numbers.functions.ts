import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";

// SECURITY: token-based cross-tenant sharing removed. See agent-shared.server.ts.
async function getSharedUazapiUserIds(userId: string) {
  return [userId];
}

export const listNumbers = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const userIds = await getSharedUazapiUserIds(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("id, nome, uazapi_url, status, meta_ads_enabled, disparos_mode, last_connected_at, created_at, warmup_started_at, warmup_enabled, auto_pause_on_risk, risk_level, last_risk_check_at")
      .in("user_id", userIds)
      // Own rows must match the active workspace; peer rows (shared via
      // uazapi_token, owned by another user) pass through regardless of
      // workspace_id since workspaces are per-user.
      .or(`workspace_id.eq.${context.workspaceId},user_id.neq.${context.userId}`)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createNumber = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      nome: z.string().min(1).max(80),
      uazapi_url: z.string().url().max(300),
      uazapi_admin_token: z.string().max(300).optional().default(""),
      uazapi_token: z.string().max(300).optional().default(""),
      meta_ads_enabled: z.boolean().optional(),
      disparos_mode: z.boolean().optional(),
    }).refine((v) => v.uazapi_admin_token.length >= 4 || v.uazapi_token.length >= 4, {
      message: "Informe o Admin Token (para criar instância) ou o Instance Token (para vincular instância existente).",
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let token = data.uazapi_token.trim();
    let initialStatus = "desconectado";
    if (token) {
      // Vincular instância existente: valida com /instance/status
      const { uazapiStatus } = await import("./uazapi.server");
      const s = await uazapiStatus({ uazapi_url: data.uazapi_url, uazapi_token: token });
      if (s.status == null) {
        throw new Error("Não foi possível validar o Instance Token na Uazapi. Verifique o token e a URL.");
      }
      initialStatus = s.status === "connected" ? "conectado" : s.status === "disconnected" ? "desconectado" : s.status;
    } else {
      const { uazapiCreateInstance } = await import("./uazapi.server");
      const r = await uazapiCreateInstance({
        uazapi_url: data.uazapi_url,
        uazapi_admin_token: data.uazapi_admin_token,
        name: data.nome,
      });
      token = r.token;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("whatsapp_numbers")
      .insert({
        user_id: context.userId,
        workspace_id: context.workspaceId,
        nome: data.nome,
        uazapi_url: data.uazapi_url,
        uazapi_admin_token: data.uazapi_admin_token || "",
        uazapi_token: token,
        status: initialStatus,
        meta_ads_enabled: data.meta_ads_enabled ?? false,
        disparos_mode: data.disparos_mode ?? false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, linked: !!data.uazapi_token };
  });

export const connectNumber = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userIds = await getSharedUazapiUserIds(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("uazapi_url, uazapi_token")
      .eq("id", data.id)
      .in("user_id", userIds)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.uazapi_url || !row.uazapi_token) throw new Error("Número sem credenciais");
    const { uazapiConnect } = await import("./uazapi.server");
    const r = await uazapiConnect({ uazapi_url: row.uazapi_url, uazapi_token: row.uazapi_token });
    const normalized =
      r.status === "connected"
        ? "conectado"
        : r.status === "disconnected"
          ? "desconectado"
          : r.status ?? "pendente";
    await supabaseAdmin
      .from("whatsapp_numbers")
      .update({
        status: normalized,
        last_connected_at: normalized === "conectado" ? new Date().toISOString() : undefined,
      })
      .eq("id", data.id);
    return { qrcode: r.qrcode, status: normalized };
  });

export const refreshNumberStatus = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userIds = await getSharedUazapiUserIds(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("uazapi_url, uazapi_token")
      .eq("id", data.id)
      .in("user_id", userIds)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.uazapi_url || !row.uazapi_token) return { status: null };
    const { uazapiStatus } = await import("./uazapi.server");
    const s = await uazapiStatus({ uazapi_url: row.uazapi_url, uazapi_token: row.uazapi_token });
    const next = s.status === "connected" ? "conectado" : s.status === "disconnected" ? "desconectado" : s.status ?? "desconectado";
    await supabaseAdmin
      .from("whatsapp_numbers")
      .update({ status: next, last_connected_at: next === "conectado" ? new Date().toISOString() : undefined })
      .eq("id", data.id);
    return { status: next };
  });

export const disconnectNumber = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userIds = await getSharedUazapiUserIds(context.userId);
    const { data: row } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("uazapi_url, uazapi_token")
      .eq("id", data.id)
      .in("user_id", userIds)
      .maybeSingle();
    if (row?.uazapi_url && row.uazapi_token) {
      const { uazapiDisconnect } = await import("./uazapi.server");
      await uazapiDisconnect({ uazapi_url: row.uazapi_url, uazapi_token: row.uazapi_token });
    }
    await supabaseAdmin
      .from("whatsapp_numbers")
      .update({ status: "desconectado" })
      .eq("id", data.id);
    return { ok: true };
  });

export const deleteNumber = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const userIds = await getSharedUazapiUserIds(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("whatsapp_numbers")
      .delete()
      .eq("id", data.id)
      .in("user_id", userIds);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateNumberToggles = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      meta_ads_enabled: z.boolean().optional(),
      disparos_mode: z.boolean().optional(),
      nome: z.string().min(1).max(80).optional(),
      warmup_enabled: z.boolean().optional(),
      auto_pause_on_risk: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.meta_ads_enabled !== undefined) patch.meta_ads_enabled = data.meta_ads_enabled;
    if (data.disparos_mode !== undefined) patch.disparos_mode = data.disparos_mode;
    if (data.nome !== undefined) patch.nome = data.nome;
    if (data.warmup_enabled !== undefined) patch.warmup_enabled = data.warmup_enabled;
    if (data.auto_pause_on_risk !== undefined) patch.auto_pause_on_risk = data.auto_pause_on_risk;
    const userIds = await getSharedUazapiUserIds(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("whatsapp_numbers")
      .update(patch as never)
      .eq("id", data.id)
      .in("user_id", userIds);
    if (error) throw new Error(error.message);
    return { ok: true };
  });