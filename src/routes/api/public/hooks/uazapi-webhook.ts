import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runAgentV3Turn } from "@/lib/agent-v3/orchestrator.server";
import { UazapiPayload, sendUazapiMessage, sendUazapiTypingState } from "@/lib/uazapi.server";

// [V3-ROUTING-GATE]
const V3_AUTHORIZED_NUMBERS = ["5511970116430"];

async function processWebhook(payload: UazapiPayload): Promise<Response> {
  // Simplificação radical para garantir restauração do serviço
  const { instance, message } = payload;
  if (!message || message.fromMe || !instance?.token) return new Response("ignored");

  const chatId = message.chatid;
  const customerPhone = chatId.replace("@c.us", "");
  const text = message.text || "";
  const msgId = message.id;

  try {
    // 1. Verificar se é um número autorizado para V3
    const isV3 = V3_AUTHORIZED_NUMBERS.includes(customerPhone);
    
    // 2. Buscar Workspace e Instância
    const { data: num } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("id, workspace_id, user_id")
      .eq("instance_token", instance.token)
      .single();

    if (!num) return new Response("ok (no instance)");

    // 3. Executar Agente V3
    if (isV3) {
      console.log(`[UAZ-WEBHOOK] Processando V3 para ${customerPhone}`);
      const result = await runAgentV3Turn({
        workspaceId: num.workspace_id,
        chatId,
        message: text,
        customerPhone,
        customerName: message.senderName || "Cliente",
        history: [], // O orquestrador deve carregar internamente se necessário
      });

      if (result.replies?.length) {
        for (const reply of result.replies) {
          await sendUazapiMessage(instance.token, chatId, reply);
        }
      }
    }

    return new Response("ok");
  } catch (e: any) {
    console.error("[UAZ-WEBHOOK] Erro Crítico:", e.message);
    return new Response("error", { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/hooks/uazapi-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = await request.json() as UazapiPayload;
          return await processWebhook(payload);
        } catch (e) {
          return new Response("invalid json", { status: 400 });
        }
      },
    },
  },
});
