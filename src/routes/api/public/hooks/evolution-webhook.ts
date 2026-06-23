import { createFileRoute } from "@tanstack/react-router";

// Evolution API webhook receiver.
// Configure in Evolution: POST {site}/api/public/hooks/evolution-webhook
// Events handled: messages.upsert (incoming user message).

type EvolutionPayload = {
  event?: string;
  instance?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      audioMessage?: { url?: string };
    };
    messageType?: string;
  };
};

function extractPhone(remoteJid?: string): string | null {
  if (!remoteJid) return null;
  // "5511999999999@s.whatsapp.net"
  const raw = remoteJid.split("@")[0];
  return raw.replace(/\D+/g, "") || null;
}

function extractText(p: EvolutionPayload): { text: string; kind: "texto" | "audio" } {
  const m = p.data?.message;
  if (m?.conversation) return { text: m.conversation, kind: "texto" };
  if (m?.extendedTextMessage?.text) return { text: m.extendedTextMessage.text, kind: "texto" };
  if (m?.audioMessage) return { text: "[áudio recebido]", kind: "audio" };
  return { text: "", kind: "texto" };
}

export const Route = createFileRoute("/api/public/hooks/evolution-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: EvolutionPayload;
        try {
          payload = (await request.json()) as EvolutionPayload;
        } catch {
          return new Response("invalid json", { status: 400 });
        }

        // Only handle incoming user messages
        const event = payload.event ?? "";
        if (!event.includes("messages.upsert")) return new Response("ignored");
        if (payload.data?.key?.fromMe) return new Response("ignored: fromMe");

        const instance = payload.instance;
        const phone = extractPhone(payload.data?.key?.remoteJid);
        if (!instance || !phone) return new Response("missing instance/phone", { status: 400 });

        const { text, kind } = extractText(payload);
        if (!text) return new Response("empty");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Resolve user by instance name
        const { data: integ, error: intErr } = await supabaseAdmin
          .from("integrations")
          .select(
            "user_id, evolution_url, evolution_api_key, evolution_instance, anthropic_api_key, elevenlabs_api_key, elevenlabs_voice_id",
          )
          .eq("evolution_instance", instance)
          .maybeSingle();
        if (intErr) return new Response(intErr.message, { status: 500 });
        if (!integ) return new Response("instance not registered", { status: 404 });

        const userId = integ.user_id;

        // Find or create contact
        let { data: contact } = await supabaseAdmin
          .from("contacts")
          .select("id, nome, perfil")
          .eq("user_id", userId)
          .eq("telefone", phone)
          .maybeSingle();

        if (!contact) {
          const inserted = await supabaseAdmin
            .from("contacts")
            .insert({
              user_id: userId,
              nome: payload.data?.pushName ?? phone,
              telefone: phone,
              perfil: "frio",
              status: "em_conversa",
            })
            .select("id, nome, perfil")
            .single();
          if (inserted.error) return new Response(inserted.error.message, { status: 500 });
          contact = inserted.data;
        }

        // Find or create conversation
        let { data: conv } = await supabaseAdmin
          .from("conversations")
          .select("id")
          .eq("user_id", userId)
          .eq("contact_id", contact.id)
          .maybeSingle();

        if (!conv) {
          const insertedConv = await supabaseAdmin
            .from("conversations")
            .insert({
              user_id: userId,
              contact_id: contact.id,
              status: "agente_respondendo",
            })
            .select("id")
            .single();
          if (insertedConv.error) return new Response(insertedConv.error.message, { status: 500 });
          conv = insertedConv.data;
        }

        const now = new Date().toISOString();

        // Save inbound message
        await supabaseAdmin.from("messages").insert({
          user_id: userId,
          conversation_id: conv.id,
          sender: "cliente",
          kind,
          body: text,
        });
        await supabaseAdmin
          .from("conversations")
          .update({
            last_message_preview: text.slice(0, 120),
            last_message_at: now,
            status: "agente_respondendo",
          })
          .eq("id", conv.id);

        // Generate AI reply if we have Claude configured
        if (!integ.anthropic_api_key) {
          return new Response("ok (no claude key)");
        }

        const { data: agent } = await supabaseAdmin
          .from("agent_config")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        if (!agent) return new Response("ok (no agent config)");

        const { data: history } = await supabaseAdmin
          .from("messages")
          .select("sender, body")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: true })
          .limit(30);

        const { generateAgentReply } = await import("@/lib/ai.server");
        const reply = await generateAgentReply({
          anthropicApiKey: integ.anthropic_api_key,
          agent,
          contact: { nome: contact.nome, perfil: contact.perfil },
          history: (history ?? []) as Array<{ sender: "agente" | "cliente"; body: string }>,
        });

        // Send reply via Evolution
        const { evolutionSendText } = await import("@/lib/evolution.server");
        try {
          await evolutionSendText(
            {
              evolution_url: integ.evolution_url ?? "",
              evolution_api_key: integ.evolution_api_key ?? "",
              evolution_instance: integ.evolution_instance ?? "",
            },
            phone,
            reply,
          );
        } catch (e) {
          return new Response(`evolution send failed: ${(e as Error).message}`, { status: 502 });
        }

        const nowReply = new Date().toISOString();
        await supabaseAdmin.from("messages").insert({
          user_id: userId,
          conversation_id: conv.id,
          sender: "agente",
          kind: "texto",
          body: reply,
        });
        await supabaseAdmin
          .from("conversations")
          .update({
            last_message_preview: reply.slice(0, 120),
            last_message_at: nowReply,
            status: "aguardando",
          })
          .eq("id", conv.id);
        await supabaseAdmin
          .from("contacts")
          .update({ last_interaction_at: nowReply, status: "em_conversa" })
          .eq("id", contact.id);

        return new Response("ok");
      },
    },
  },
});