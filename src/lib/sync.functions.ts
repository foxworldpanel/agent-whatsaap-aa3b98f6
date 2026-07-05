import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";

type Conv = { id: string; user_id: string; workspace_id: string; contact_id: string; contact_phone: string };

export const syncWhatsappMessages = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { uazapiListMessages } = await import("./uazapi.server");

    // Resolve shared users via same uazapi_token
    const { data: ownInt } = await supabaseAdmin
      .from("integrations")
      .select("uazapi_token, uazapi_url")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!ownInt?.uazapi_token || !ownInt?.uazapi_url) {
      return { ok: false, inserted: 0, error: "Configure a Uazapi primeiro." };
    }

    const { data: shared } = await supabaseAdmin
      .from("integrations")
      .select("user_id, uazapi_url, uazapi_token")
      .eq("uazapi_token", ownInt.uazapi_token);
    const userIds = Array.from(new Set([context.userId, ...(shared ?? []).map((r) => r.user_id)]));

    // Load active conversations (cap to most-recent 50 to keep request fast)
    const { data: convsRaw } = await supabaseAdmin
      .from("conversations")
      .select("id, user_id, workspace_id, contact_id, contact:contacts(telefone)")
      .in("user_id", userIds)
      .eq("workspace_id", context.workspaceId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(50);

    const convs: Conv[] = (convsRaw ?? [])
      .map((c: any) => ({
        id: c.id,
        user_id: c.user_id,
        workspace_id: c.workspace_id,
        contact_id: c.contact_id,
        contact_phone: c.contact?.telefone ?? "",
      }))
      .filter((c) => c.contact_phone);

    const creds = { uazapi_url: ownInt.uazapi_url, uazapi_token: ownInt.uazapi_token };
    let inserted = 0;

    for (const conv of convs) {
      try {
        const msgs = await uazapiListMessages(creds, conv.contact_phone, 30);
        if (msgs.length === 0) continue;

        const ids = msgs.map((m) => m.external_id);
        const { data: existing } = await supabaseAdmin
          .from("messages")
          .select("external_id")
          .eq("conversation_id", conv.id)
          .eq("workspace_id", context.workspaceId)
          .in("external_id", ids);
        const have = new Set((existing ?? []).map((r: any) => r.external_id));

        const toInsert = msgs
          .filter((m) => !have.has(m.external_id) && m.text)
          .map((m) => ({
            user_id: conv.user_id,
            workspace_id: conv.workspace_id,
            conversation_id: conv.id,
            sender: (m.from_me ? "agente" : "cliente") as "agente" | "cliente",
            kind: (m.type === "audio" || m.type === "audioMessage" ? "audio" : "texto") as "audio" | "texto",
            body: m.text ?? "",
            external_id: m.external_id,
            created_at: m.timestamp,
          }));

        if (toInsert.length === 0) continue;

        const { error: insErr } = await supabaseAdmin
          .from("messages")
          .insert(toInsert);
        if (insErr) continue;
        inserted += toInsert.length;

        // Update conversation preview from newest message
        const newest = msgs.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
        await supabaseAdmin
          .from("conversations")
          .update({
            last_message_preview: (newest.text ?? "").slice(0, 120),
            last_message_at: newest.timestamp,
          })
          .eq("id", conv.id)
          .eq("workspace_id", context.workspaceId);
      } catch {
        // ignore per-conv errors
      }
    }

    return { ok: true, inserted, syncedAt: new Date().toISOString() };
  });
