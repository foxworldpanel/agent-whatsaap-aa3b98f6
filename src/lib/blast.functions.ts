import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SEED_NAME = "Músicos e Artistas";
const SEED_OPENING =
  "Oi {nome}! Tudo bem?\n\nVi seu perfil no Instagram @{instagram} — conteúdo muito bom!\n\nTenho algo que pode acelerar muito o crescimento do seu perfil. Posso te explicar?";
const SEED_D3 =
  "Oi {nome}! Passando pra deixar uma dica rápida sobre crescimento no Spotify e Instagram. Tem interesse?";
const SEED_D7 =
  "Oi {nome}! Última mensagem — se quiser crescer seu perfil nas redes é só me chamar 😊";

export const listBlastCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("blast_campaigns")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const list = data ?? [];
    if (!list.find((c) => c.name === SEED_NAME)) {
      const { data: seed, error: insErr } = await context.supabase
        .from("blast_campaigns")
        .insert({
          user_id: context.userId,
          name: SEED_NAME,
          start_time: "09:00",
          end_time: "20:00",
          daily_limit: 200,
          delay_min_sec: 45,
          delay_max_sec: 90,
          opening_message: SEED_OPENING,
          followup_day3_message: SEED_D3,
          followup_day7_message: SEED_D7,
          state: "parado",
        })
        .select("*")
        .single();
      if (insErr) throw new Error(insErr.message);
      list.push(seed);
    }
    return list;
  });

export const updateBlastCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        whatsapp_number_id: z.string().uuid().nullable().optional(),
        start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
        end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
        daily_limit: z.number().int().min(1).max(5000).optional(),
        delay_min_sec: z.number().int().min(5).max(3600).optional(),
        delay_max_sec: z.number().int().min(5).max(3600).optional(),
        opening_message: z.string().max(4000).optional(),
        followup_day3_message: z.string().max(4000).optional(),
        followup_day7_message: z.string().max(4000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const patch: Record<string, unknown> = { ...rest };
    if (patch.start_time && (patch.start_time as string).length === 5) patch.start_time += ":00";
    if (patch.end_time && (patch.end_time as string).length === 5) patch.end_time += ":00";
    const { error } = await context.supabase
      .from("blast_campaigns")
      .update(patch)
      .eq("id", id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setBlastCampaignState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        state: z.enum(["parado", "rodando", "pausado"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("blast_campaigns")
      .update({ state: data.state })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function normalizePhone(raw: string): string {
  return raw.replace(/\D+/g, "");
}

export const importBlastContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        rows: z
          .array(
            z.object({
              nome: z.string().trim().min(1).max(120),
              telefone: z.string().trim().min(5).max(40),
              instagram: z.string().trim().max(80).optional().default(""),
            }),
          )
          .min(1)
          .max(5000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const payload = data.rows
      .map((r) => ({
        user_id: context.userId,
        campaign_id: data.campaignId,
        nome: r.nome,
        telefone: normalizePhone(r.telefone),
        instagram: (r.instagram ?? "").replace(/^@/, ""),
        status: "pendente" as const,
      }))
      .filter((r) => r.telefone.length >= 10);
    if (payload.length === 0) return { inserted: 0 };
    const { error, count } = await context.supabase
      .from("blast_contacts")
      .insert(payload, { count: "exact" });
    if (error) throw new Error(error.message);
    return { inserted: count ?? payload.length };
  });

export const listBlastContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaignId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("blast_contacts")
      .select("id, nome, telefone, instagram, status, last_sent_at, replied_at")
      .eq("user_id", context.userId)
      .eq("campaign_id", data.campaignId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getBlastReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaignId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("blast_contacts")
      .select("status")
      .eq("user_id", context.userId)
      .eq("campaign_id", data.campaignId);
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    const total = list.length;
    const sent = list.filter((r) =>
      ["enviado_abertura", "enviado_d3", "enviado_d7", "respondeu", "convertido"].includes(r.status as string),
    ).length;
    const replied = list.filter((r) => r.status === "respondeu" || r.status === "convertido").length;
    const converted = list.filter((r) => r.status === "convertido").length;
    const noReply = list.filter((r) =>
      ["enviado_abertura", "enviado_d3", "enviado_d7"].includes(r.status as string),
    ).length;
    const rate = sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0;
    return { total, sent, replied, converted, noReply, replyRate: rate };
  });

export const clearBlastContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ campaignId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("blast_contacts")
      .delete()
      .eq("user_id", context.userId)
      .eq("campaign_id", data.campaignId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });