import { createFileRoute } from "@tanstack/react-router";
import { runAgentV3Turn } from "@/lib/agent-v3/orchestrator.server";

// [V3-TEST] Webhook receiver isolado para testes da arquitetura V3.
// URL: {site}/api/public/hooks/v3-test-webhook
// Número autorizado: 5511999999999

type UazapiPayload = {
  event?: string;
  EventType?: string;
  token?: string;
  instance?: { token?: string } | string;
  message?: {
    chatid?: string;
    sender?: string;
    text?: string;
    fromMe?: boolean;
  };
};

export const Route = createFileRoute("/api/public/hooks/v3-test-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = (await request.json()) as UazapiPayload;
        const phone = payload.message?.chatid?.split("@")[0] || payload.message?.sender?.split("@")[0];
        
        // Gate de segurança para o número de teste
        if (phone !== "5511999999999") {
          return new Response("Unauthorized number", { status: 403 });
        }

        if (payload.message?.fromMe) {
          return new Response("ok");
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        
        // Tenta resolver o user_id pelo token da instância
        const token = typeof payload.instance === 'string' ? payload.instance : payload.instance?.token || payload.token;
        const { data: num } = await supabaseAdmin
          .from("whatsapp_numbers")
          .select("user_id")
          .eq("uazapi_token", token)
          .maybeSingle();

        const userId = num?.user_id;
        if (!userId) return new Response("User not found", { status: 404 });

        // Chama V3
        const result = await runAgentV3Turn({
          userId,
          message: payload.message?.text || "",
          history: [], // Mock simplificado para teste
          enabledModules: ["tabela_precos", "social_proof"], // Módulos padrão para teste
          anthropicApiKey: process.env.ANTHROPIC_API_KEY || ""
        });

        console.log("[V3-TEST] Reply:", result.replies[0]);

        return new Response(JSON.stringify({
          status: "success",
          v3_reply: result.replies[0],
          temperature: result.temperature
        }), {
          headers: { "Content-Type": "application/json" }
        });
      },
    },
  },
});
