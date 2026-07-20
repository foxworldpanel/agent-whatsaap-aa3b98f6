import { createFileRoute } from "@tanstack/react-router";
import { sendAgentTextGuarded } from "@/lib/send-agent-guarded.server";

// Uazapi webhook receiver.
// Configure em Uazapi → Webhooks: POST {site}/api/public/hooks/uazapi-webhook
// Eventos: messages (mensagens recebidas).

type UazapiPayload = {
  event?: string;
  EventType?: string;
  token?: string; // token da instância
  instance?: { token?: string } | string;
  message?: {
    chatid?: string;
    sender?: string;
    messageid?: string;
    messageId?: string;
    id?: string;
    fromMe?: boolean;
    type?: string;
    text?: string;
    content?: string;
  };
  data?: UazapiPayload["message"];
};

function pickInstanceToken(p: UazapiPayload): string | null {
  if (typeof p.token === "string" && p.token) return p.token;
  if (typeof p.instance === "string") return p.instance;
  if (p.instance && typeof p.instance === "object" && p.instance.token) return p.instance.token;
  return null;
}

function extractPhone(chatid?: string, sender?: string): string | null {
  const raw = (chatid ?? sender ?? "").split("@")[0];
  const digits = raw.replace(/\D+/g, "");
  return digits || null;
}

function extractContent(p: UazapiPayload): { text: string; kind: "texto" | "audio" | "image" | "sticker" } {
  const m = p.message ?? p.data ?? {};
  // Simplificado para V3 routing
  return { text: m.text ?? m.content ?? "", kind: "texto" };
}

async function processWebhook(payload: UazapiPayload): Promise<Response> {
    const { supabaseAdmin: adminEarly } = await import("@/integrations/supabase/client.server");
    const msgLocal = payload.message ?? payload.data ?? {};
    const phoneLocal = extractPhone(msgLocal.chatid, msgLocal.sender);
    const phoneStrLocal = String(phoneLocal || "");
    
    // Bloqueio de mensagens enviadas pelo próprio bot
    if (msgLocal.fromMe) {
      return new Response("ok (ignoring self)");
    }

    // Validação de número autorizado (Apenas este número executa a IA V3)
    const AUTHORIZED_PHONES = ["5511970116430"];
    const isAuthorized = AUTHORIZED_PHONES.includes(phoneStrLocal);

    if (!isAuthorized) {
      const phoneTail = phoneStrLocal.slice(-4);
      console.log(`🚫 AI disabled for non-authorized contact (…${phoneTail})`);
      return new Response("ok (unauthorized number)");
    }

    // [V3-ROUTING-GATE] - Runtime ÚNICO autorizado
    console.log("[V3-GATE] Processando turno para:", phoneStrLocal);
    
    try {
      const instanceToken = pickInstanceToken(payload);
      const { text: msgText } = extractContent(payload);
      
      // Resolve contexto básico da instância
      const { data: num } = await adminEarly
        .from("whatsapp_numbers")
        .select("user_id, workspace_id, uazapi_url")
        .eq("uazapi_token", instanceToken || "")
        .maybeSingle();
      
      const targetUserId = num?.user_id || "f8da521a-e8db-4efe-8c9b-9bd69749c0a7";
      
      const { data: integ } = await adminEarly
        .from("integrations")
        .select("anthropic_api_key")
        .eq("user_id", targetUserId)
        .maybeSingle();

      const { runAgentV3Turn } = await import("@/lib/agent-v3/orchestrator.server");
      const { getConversationStateV3, saveConversationStateV3 } = await import("@/lib/agent-v3/conversation-state.server");

      // Carrega histórico V3
      const history = await getConversationStateV3(targetUserId, phoneStrLocal);
      
      // Executa Orquestrador V3 (ÚNICO CAMINHO)
      const v3Response = await runAgentV3Turn({
        userId: targetUserId,
        message: msgText || "",
        history: history,
        anthropicApiKey: integ?.anthropic_api_key || ""
      });

      const replyText = v3Response.replies.join("\n\n");

      // Salva histórico V3
      await saveConversationStateV3(targetUserId, phoneStrLocal, [
        ...history,
        { role: "customer" as const, content: msgText || "" },
        { role: "agent" as const, content: replyText }
      ]);

      // Busca ID da conversa para logs
      const { data: contactData } = await adminEarly
        .from("contacts")
        .select("id")
        .eq("user_id", targetUserId)
        .eq("telefone", phoneStrLocal)
        .maybeSingle();

      const { data: conv } = contactData ? await adminEarly
        .from("conversations")
        .select("id")
        .eq("contact_id", contactData.id)
        .maybeSingle() : { data: null };

      // Envio via canal seguro
      await sendAgentTextGuarded(
        { uazapi_url: num?.uazapi_url || "https://mindsmmglobal.uazapi.com", uazapi_token: instanceToken || "" },
        phoneStrLocal,
        replyText,
        { conversationId: conv?.id || phoneStrLocal, source: "agent_v3", applyHumanize: true }
      );

      console.log("[V3-GATE] Sucesso para:", phoneStrLocal);
      return new Response("ok (V3 processed)");

    } catch (e: any) {
      console.error("[V3-CRITICAL-ERROR] Falha catastrófica:", e);
      
      const instanceToken = pickInstanceToken(payload);
      
      // Envia mensagem neutra de indisponibilidade
      await sendAgentTextGuarded(
        { uazapi_url: "https://mindsmmglobal.uazapi.com", uazapi_token: instanceToken || "" },
        phoneStrLocal,
        "Desculpe, tive um problema técnico momentâneo. Pode tentar de novo em instantes?",
        { conversationId: phoneStrLocal, source: "v3_error_fallback" }
      ).catch(() => {});
      
      return new Response("ok (V3 error handled - no V1 fallback)");
    }
}

export const Route = createFileRoute("/api/public/hooks/uazapi-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        let payload: UazapiPayload | null = null;
        try {
          payload = JSON.parse(rawBody) as UazapiPayload;
        } catch (e) {
          return new Response("invalid json", { status: 400 });
        }

        if (!payload) {
          return new Response("no payload", { status: 400 });
        }

        try {
          return await processWebhook(payload);
        } catch (e) {
          console.error("webhook process catched", e);
          return new Response("internal error", { status: 500 });
        }
      },
    },
  },
});
