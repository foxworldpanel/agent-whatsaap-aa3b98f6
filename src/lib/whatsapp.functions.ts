import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";

async function getSharedUazapiUserIds(context: { supabase: any; userId: string }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: ownIntegration, error } = await supabaseAdmin
    .from("integrations")
    .select("uazapi_token")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const token = ownIntegration?.uazapi_token;
  if (!token) return [context.userId];

  const { data: sharedRows, error: sharedError } = await supabaseAdmin
    .from("integrations")
    .select("user_id")
    .eq("uazapi_token", token);
  if (sharedError) throw new Error(sharedError.message);

  return Array.from(new Set([context.userId, ...(sharedRows ?? []).map((row) => row.user_id)]));
}

// List conversations with contact info
export const listConversations = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({ numberId: z.string().uuid().nullable().optional() }).optional().parse(d),
  )
  .handler(async ({ data, context }) => {
    const userIds = await getSharedUazapiUserIds(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("conversations")
      .select(
        "id, status, last_message_preview, last_message_at, agent_enabled, whatsapp_number_id, needs_review, review_reason, auto_paused_at, internal_note, contact:contacts(id, nome, telefone, perfil, temperatura, source, source_ref, source_url, source_headline, photo_url)",
      )
      .in("user_id", userIds)
      .eq("workspace_id", context.workspaceId)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (data?.numberId) q = q.eq("whatsapp_number_id", data.numberId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return [];
    const { data: testRows } = await supabaseAdmin
      .from("test_numbers")
      .select("phone")
      .in("user_id", userIds);
    const testSet = new Set((testRows ?? []).map((r) => r.phone));
    return rows.map((r: any) => ({
      ...r,
      is_test: r.contact?.telefone ? testSet.has(r.contact.telefone) : false,
    }));
  });

export const listMessages = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const userIds = await getSharedUazapiUserIds(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("messages")
      .select("id, sender, kind, body, audio_url, created_at")
      .in("user_id", userIds)
      .eq("workspace_id", context.workspaceId)
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Manual send from the Conversas screen.
export const sendManualMessage = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      conversationId: z.string().uuid(),
      text: z.string().min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const userIds = await getSharedUazapiUserIds(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: conv, error: convErr } = await supabaseAdmin
      .from("conversations")
      .select("id, user_id, contact:contacts(telefone)")
      .eq("id", data.conversationId)
      .in("user_id", userIds)
      .eq("workspace_id", context.workspaceId)
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
      workspace_id: context.workspaceId,
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
      .eq("id", data.conversationId)
      .eq("workspace_id", context.workspaceId);

    return { ok: true };
  });

// Clear conversation history and reset agent context for that contact.
export const clearConversation = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const userIds = await getSharedUazapiUserIds(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: conv, error: convErr } = await supabaseAdmin
      .from("conversations")
      .select("id, user_id")
      .eq("id", data.conversationId)
      .in("user_id", userIds)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!conv) throw new Error("Conversa não encontrada");

    const { error: delErr } = await supabaseAdmin
      .from("messages")
      .delete()
      .eq("conversation_id", data.conversationId)
      .eq("workspace_id", context.workspaceId);
    if (delErr) throw new Error(delErr.message);

    const { error: updErr } = await supabaseAdmin
      .from("conversations")
      .update({
        last_message_preview: null,
        last_message_at: null,
      })
      .eq("id", data.conversationId)
      .eq("workspace_id", context.workspaceId);
    if (updErr) throw new Error(updErr.message);

    return { ok: true };
  });