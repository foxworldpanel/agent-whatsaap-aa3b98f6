import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";

type Conv = {
  id: string;
  user_id: string;
  workspace_id: string;
  contact_id: string;
  contact_phone: string;
};

function digits(value: string): string {
  return String(value || "").replace(/\D+/g, "");
}

function isAudioType(type: string | null): boolean {
  const value = String(type || "").toLowerCase();
  return value.includes("audio") || value.includes("ptt") || value.includes("voice");
}

/**
 * Sincronização de auditoria do WhatsApp:
 * - importa todos os chats individuais conhecidos pela Uazapi;
 * - atualiza nome/foto;
 * - cria contatos/conversas ausentes;
 * - faz backfill das mensagens recentes de TODAS as conversas, não só 50;
 * - preserva a transcrição já gravada pelo webhook do Agent V3.
 */
export const syncWhatsappMessages = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { uazapiListMessages, uazapiListChats, uazapiGetProfilePic } = await import("./uazapi.server");

    const { data: ownInt, error: intError } = await supabaseAdmin
      .from("integrations")
      .select("uazapi_token, uazapi_url")
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();

    if (intError || !ownInt?.uazapi_token || !ownInt?.uazapi_url) {
      return { ok: false, inserted: 0, createdConversations: 0, photosUpdated: 0, error: "Configure a Uazapi primeiro." };
    }

    const creds = {
      uazapi_url: ownInt.uazapi_url,
      uazapi_token: ownInt.uazapi_token,
    };

    let inserted = 0;
    let createdConversations = 0;
    let photosUpdated = 0;

    // 1. Descobre os chats existentes diretamente na Uazapi.
    let chats: Awaited<ReturnType<typeof uazapiListChats>> = [];
    try {
      chats = await uazapiListChats(creds);
    } catch (error) {
      console.warn("[sync-whatsapp] /chat/find indisponível; usando somente conversas locais:", error);
    }

    // Carrega número WhatsApp padrão do workspace para associar novos registros.
    const { data: defaultNumber } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("id")
      .eq("workspace_id", context.workspaceId)
      .order("last_connected_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    // 2. Garante contato + conversa para cada chat individual.
    for (const chat of chats) {
      const phone = digits(chat.phone);
      if (!phone) continue;

      const { data: existingContact } = await supabaseAdmin
        .from("contacts")
        .select("id, nome, photo_url, user_id")
        .eq("workspace_id", context.workspaceId)
        .eq("telefone", phone)
        .limit(1)
        .maybeSingle();

      let contactId = existingContact?.id;
      let userId = existingContact?.user_id || context.userId;
      let imageUrl = chat.image_url || existingContact?.photo_url || null;

      // /chat/find nem sempre devolve a foto; busca individual só quando estiver faltando.
      if (!imageUrl) {
        imageUrl = await uazapiGetProfilePic(creds, phone).catch(() => null);
      }

      if (contactId) {
        const patch: Record<string, unknown> = {
          ...(chat.name && (!existingContact?.nome || existingContact.nome === phone)
            ? { nome: chat.name }
            : {}),
          ...(imageUrl ? { photo_url: imageUrl } : {}),
          ...(chat.last_message_at ? { last_interaction_at: chat.last_message_at } : {}),
          ...(defaultNumber?.id ? { whatsapp_number_id: defaultNumber.id } : {}),
        };

        if (Object.keys(patch).length > 0) {
          await supabaseAdmin
            .from("contacts")
            .update(patch)
            .eq("id", contactId)
            .eq("workspace_id", context.workspaceId);
        }
        if (imageUrl && imageUrl !== existingContact?.photo_url) photosUpdated += 1;
      } else {
        const { data: insertedContact, error: contactError } = await supabaseAdmin
          .from("contacts")
          .insert({
            user_id: context.userId,
            workspace_id: context.workspaceId,
            nome: chat.name?.trim() || phone,
            telefone: phone,
            perfil: "frio",
            temperatura: "frio",
            status: "nao_abordado",
            source: "whatsapp_sync",
            photo_url: imageUrl,
            last_interaction_at: chat.last_message_at,
            whatsapp_number_id: defaultNumber?.id ?? null,
          })
          .select("id, user_id")
          .single();

        if (contactError || !insertedContact) {
          console.warn("[sync-whatsapp] Falha ao criar contato:", phone, contactError);
          continue;
        }

        contactId = insertedContact.id;
        userId = insertedContact.user_id;
        if (imageUrl) photosUpdated += 1;
      }

      const { data: existingConversation } = await supabaseAdmin
        .from("conversations")
        .select("id")
        .eq("workspace_id", context.workspaceId)
        .eq("contact_id", contactId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!existingConversation?.id) {
        const { error: convError } = await supabaseAdmin
          .from("conversations")
          .insert({
            user_id: userId,
            workspace_id: context.workspaceId,
            contact_id: contactId,
            whatsapp_number_id: defaultNumber?.id ?? null,
            status: "aguardando",
            agent_enabled: true,
            last_message_preview: chat.last_message?.slice(0, 120) || null,
            last_message_at: chat.last_message_at,
          });

        if (!convError) createdConversations += 1;
        else console.warn("[sync-whatsapp] Falha ao criar conversa:", phone, convError);
      }
    }

    // 3. Carrega TODAS as conversas do workspace em páginas.
    const convs: Conv[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data: convsRaw, error } = await supabaseAdmin
        .from("conversations")
        .select("id, user_id, workspace_id, contact_id, contact:contacts(telefone)")
        .eq("workspace_id", context.workspaceId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .range(from, from + pageSize - 1);

      if (error) break;

      convs.push(
        ...((convsRaw ?? [])
          .map((c: any) => ({
            id: c.id,
            user_id: c.user_id,
            workspace_id: c.workspace_id,
            contact_id: c.contact_id,
            contact_phone: c.contact?.telefone ?? "",
          }))
          .filter((c: Conv) => c.contact_phone)),
      );

      if (!convsRaw || convsRaw.length < pageSize) break;
    }

    // 4. Backfill maior para auditoria. 500 mensagens por conversa cobre históricos longos
    // sem transformar a sincronização em uma varredura ilimitada da API externa.
    for (const conv of convs) {
      try {
        const msgs = await uazapiListMessages(creds, conv.contact_phone, 500);
        if (msgs.length === 0) continue;

        const ids = msgs.map((m) => m.external_id).filter(Boolean);
        const have = new Set<string>();

        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          const { data: existing } = await supabaseAdmin
            .from("messages")
            .select("external_id")
            .eq("conversation_id", conv.id)
            .eq("workspace_id", context.workspaceId)
            .in("external_id", chunk);
          for (const row of existing ?? []) {
            if (row.external_id) have.add(row.external_id);
          }
        }

        const toInsert = msgs
          .filter((m) => !have.has(m.external_id))
          .map((m) => {
            const audio = isAudioType(m.type);
            const rawText = m.text?.trim() || "";
            return {
              user_id: conv.user_id,
              workspace_id: conv.workspace_id,
              conversation_id: conv.id,
              sender: (m.from_me ? "agente" : "cliente") as "agente" | "cliente",
              kind: (audio ? "audio" : "texto") as "audio" | "texto",
              // Em histórico antigo sem transcrição, deixa uma marca explícita.
              // Áudios processados pelo V3 continuam mostrando a transcrição real salva no body.
              body: rawText || (audio ? "[áudio sem transcrição histórica]" : "[mensagem sem texto]"),
              external_id: m.external_id,
              created_at: m.timestamp,
            };
          });

        if (toInsert.length > 0) {
          const { error: insErr } = await supabaseAdmin.from("messages").insert(toInsert);
          if (!insErr) inserted += toInsert.length;
          else console.warn("[sync-whatsapp] Falha ao inserir mensagens:", insErr);
        }

        const newest = msgs.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
        await supabaseAdmin
          .from("conversations")
          .update({
            last_message_preview: (newest.text || (isAudioType(newest.type) ? "Áudio" : "")).slice(0, 120),
            last_message_at: newest.timestamp,
          })
          .eq("id", conv.id)
          .eq("workspace_id", context.workspaceId);
      } catch (error) {
        console.warn("[sync-whatsapp] Falha por conversa:", conv.contact_phone, error);
      }
    }

    return {
      ok: true,
      inserted,
      createdConversations,
      photosUpdated,
      totalChats: chats.length,
      totalConversations: convs.length,
      syncedAt: new Date().toISOString(),
    };
  });
