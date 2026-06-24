import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function getSharedUazapiUserIds(context: { supabase: any; userId: string }) {
  const { data: ownIntegration, error } = await context.supabase
    .from("integrations")
    .select("uazapi_token")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const token = ownIntegration?.uazapi_token;
  if (!token) return [context.userId];

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: sharedRows, error: sharedError } = await supabaseAdmin
    .from("integrations")
    .select("user_id")
    .eq("uazapi_token", token);
  if (sharedError) throw new Error(sharedError.message);

  return Array.from(new Set([context.userId, ...(sharedRows ?? []).map((row) => row.user_id)]));
}

// List conversations with contact info
export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ numberId: z.string().uuid().nullable().optional() }).optional().parse(d),
  )
  .handler(async ({ data, context }) => {
    const userIds = await getSharedUazapiUserIds(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("conversations")
      .select(
        "id, status, last_message_preview, last_message_at, agent_enabled, whatsapp_number_id, contact:contacts(id, nome, telefone, perfil, temperatura, source, source_ref, source_url, source_headline, photo_url)",
      )
      .in("user_id", userIds)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (data?.numberId) q = q.eq("whatsapp_number_id", data.numberId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const userIds = await getSharedUazapiUserIds(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("messages")
      .select("id, sender, kind, body, audio_url, created_at")
      .in("user_id", userIds)
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Manual send from the Conversas screen.
export const sendManualMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      conversationId: z.string().uuid(),
      text: z.string().min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const userIds = await getSharedUazapiUserIds(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: conv, error: convErr } = await supabaseAdmin
      .from("conversations")
      .select("id, user_id, contact:contacts(telefone)")
      .eq("id", data.conversationId)
      .in("user_id", userIds)
      .maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!conv?.contact) throw new Error("Conversa não encontrada");

    const { data: integ, error: intErr } = await supabaseAdmin
      .from("integrations")
      .select("uazapi_url, uazapi_token")
      .eq("user_id", conv.user_id)
      .maybeSingle();
    if (intErr) throw new Error(intErr.message);
    if (!integ?.uazapi_url || !integ.uazapi_token) {
      throw new Error("Configure a Uazapi na tela do Agente.");
    }

    const contact = conv.contact as unknown as { telefone: string };
    const { uazapiSendText } = await import("./uazapi.server");
    await uazapiSendText(
      {
        uazapi_url: integ.uazapi_url,
        uazapi_token: integ.uazapi_token,
      },
      contact.telefone,
      data.text,
    );

    const now = new Date().toISOString();
    const { error: msgErr } = await supabaseAdmin.from("messages").insert({
      user_id: conv.user_id,
      conversation_id: data.conversationId,
      sender: "agente",
      kind: "texto",
      body: data.text,
    });
    if (msgErr) throw new Error(msgErr.message);

    await supabaseAdmin
      .from("conversations")
      .update({
        last_message_preview: data.text.slice(0, 120),
        last_message_at: now,
        status: "aguardando",
      })
      .eq("id", data.conversationId);

    return { ok: true };
  });