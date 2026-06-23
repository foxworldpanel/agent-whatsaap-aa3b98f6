import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// List conversations with contact info
export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("conversations")
      .select(
        "id, status, last_message_preview, last_message_at, contact:contacts(id, nome, telefone, perfil, source, source_ref, source_url, source_headline)",
      )
      .eq("user_id", context.userId)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("messages")
      .select("id, sender, kind, body, audio_url, created_at")
      .eq("user_id", context.userId)
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

    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select("id, contact:contacts(telefone)")
      .eq("id", data.conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!conv?.contact) throw new Error("Conversa não encontrada");

    const { data: integ, error: intErr } = await supabase
      .from("integrations")
      .select("uazapi_url, uazapi_token")
      .eq("user_id", userId)
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
    const { error: msgErr } = await supabase.from("messages").insert({
      user_id: userId,
      conversation_id: data.conversationId,
      sender: "agente",
      kind: "texto",
      body: data.text,
    });
    if (msgErr) throw new Error(msgErr.message);

    await supabase
      .from("conversations")
      .update({
        last_message_preview: data.text.slice(0, 120),
        last_message_at: now,
        status: "aguardando",
      })
      .eq("id", data.conversationId);

    return { ok: true };
  });