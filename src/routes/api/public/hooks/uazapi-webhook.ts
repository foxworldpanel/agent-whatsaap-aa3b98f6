import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runAgentV3Turn } from "@/lib/agent-v3/orchestrator.server";
import { uazapiSendText, uazapiSendTyping } from "@/lib/uazapi.server";

// Interfaces básicas para o webhook
interface UazapiPayload {
  instance: { token: string };
  message: {
    id: string;
    chatid: string;
    text?: string;
    fromMe: boolean;
    senderName?: string;
  };
}

const V3_AUTHORIZED_NUMBERS = ["5511970116430"];

async function processWebhook(payload: UazapiPayload): Promise<Response> {
  const { instance, message } = payload;
  if (!message || message.fromMe || !instance?.token) return new Response("ignored");

  const chatId = message.chatid;
  const customerPhone = chatId.replace("@c.us", "");
  const text = message.text || "";

  try {
    const isV3 = V3_AUTHORIZED_NUMBERS.includes(customerPhone);
    
    // Buscar Workspace/Instância no banco
    const { data: num } = await supabaseAdmin
      .from("whatsapp_numbers")
      .select("id, workspace_id, user_id")
      .or(`uazapi_token.eq.${instance.token},id.eq.${instance.token}`)
      .maybeSingle();

    if (!num || !num.workspace_id) {
      console.log(`[UAZ-WEBHOOK] Instância não encontrada ou sem workspace: ${instance.token}`);
      return new Response("ok (no instance)");
    }

    const creds = {
      uazapi_url: "https://api.uazapi.dev",
      uazapi_token: instance.token
    };

    if (isV3) {
      console.log(`[UAZ-WEBHOOK] Processando V3 para ${customerPhone}`);
      
      await uazapiSendTyping(creds, chatId, 2000).catch(() => null);

      const result = await runAgentV3Turn({
        userId: num.user_id || "system",
        workspaceId: num.workspace_id,
        message: text,
        history: [],
        phone: customerPhone,
        anthropicApiKey: process.env.ANTHROPIC_API_KEY || ""
      });

      if (result.replies?.length) {
        for (const reply of result.replies) {
          await uazapiSendText(creds, chatId, reply);
        }
      }
    }

    return new Response("ok");
  } catch (e: any) {
    console.error("[UAZ-WEBHOOK] Erro Crítico:", e.message);
    return new Response("ok (AI error flagged)");
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
