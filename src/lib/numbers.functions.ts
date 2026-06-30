import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listNumbers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("whatsapp_numbers")
      .select("id, nome, uazapi_url, status, meta_ads_enabled, disparos_mode, last_connected_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    const { data: row, error } = await context.supabase
      .from("whatsapp_numbers")
      .insert({
        user_id: context.userId,
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("uazapi_url, uazapi_token")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.uazapi_url || !row.uazapi_token) throw new Error("Número sem credenciais");
    const { uazapiConnect } = await import("./uazapi.server");
    const r = await uazapiConnect({ uazapi_url: row.uazapi_url, uazapi_token: row.uazapi_token });
    await context.supabase
      .from("whatsapp_numbers")
      .update({ status: r.status ?? "pendente" })
      .eq("id", data.id);
    return { qrcode: r.qrcode, status: r.status };
  });

export const refreshNumberStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("uazapi_url, uazapi_token")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.uazapi_url || !row.uazapi_token) return { status: null };
    const { uazapiStatus } = await import("./uazapi.server");
    const s = await uazapiStatus({ uazapi_url: row.uazapi_url, uazapi_token: row.uazapi_token });
    const next = s.status === "connected" ? "conectado" : s.status === "disconnected" ? "desconectado" : s.status ?? "desconectado";
    await context.supabase
      .from("whatsapp_numbers")
      .update({ status: next, last_connected_at: next === "conectado" ? new Date().toISOString() : undefined })
      .eq("id", data.id);
    return { status: next };
  });

export const disconnectNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("uazapi_url, uazapi_token")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (row?.uazapi_url && row.uazapi_token) {
      const { uazapiDisconnect } = await import("./uazapi.server");
      await uazapiDisconnect({ uazapi_url: row.uazapi_url, uazapi_token: row.uazapi_token });
    }
    await context.supabase
      .from("whatsapp_numbers")
      .update({ status: "desconectado" })
      .eq("id", data.id);
    return { ok: true };
  });

export const deleteNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("whatsapp_numbers")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateNumberToggles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      meta_ads_enabled: z.boolean().optional(),
      disparos_mode: z.boolean().optional(),
      nome: z.string().min(1).max(80).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.meta_ads_enabled !== undefined) patch.meta_ads_enabled = data.meta_ads_enabled;
    if (data.disparos_mode !== undefined) patch.disparos_mode = data.disparos_mode;
    if (data.nome !== undefined) patch.nome = data.nome;
    const { error } = await context.supabase
      .from("whatsapp_numbers")
      .update(patch as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });