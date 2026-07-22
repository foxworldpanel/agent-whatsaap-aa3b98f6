import { createFileRoute } from "@tanstack/react-router";
import { runAgentV3Turn } from "@/lib/agent-v3/orchestrator.server";

// [V3-TEST] Webhook receiver isolado para testes da arquitetura V3.
// URL: {site}/api/public/hooks/v3-test-webhook
// Número autorizado: 5511970116430

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

        // SECURITY: verify the sender BEFORE trusting any payload fields.
        // Require a valid instance token that matches a provisioned WhatsApp
        // number; never authorize solely on the phone number embedded in the
        // request body (attacker-controlled).
        const token = typeof payload.instance === 'string'
          ? payload.instance
          : payload.instance?.token || payload.token;
        if (!token) {
          return new Response("unauthorized (no instance token)", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: num } = await supabaseAdmin
          .from("whatsapp_numbers")
          .select("user_id")
          .eq("uazapi_token", token)
          .maybeSingle();
        const userId = num?.user_id;
        if (!userId) {
          return new Response("unauthorized (unknown instance)", { status: 401 });
        }

        const phone = payload.message?.chatid?.split("@")[0] || payload.message?.sender?.split("@")[0];
        if (phone !== "5511970116430") {
          return new Response("Unauthorized number", { status: 403 });
        }
        if (payload.message?.fromMe) {
          return new Response("ok");
        }

        // Chama V3
        const result = await runAgentV3Turn({
          userId,
          message: payload.message?.text || "",
          history: [],
          enabledModules: [], // Carregamento dinâmico via agent_config
          anthropicApiKey: process.env.ANTHROPIC_API_KEY || ""
        });

        console.log("[V3-TEST] Reply:", result.replies[0]);

        return new Response(JSON.stringify({
          status: "success",
          v3_reply: result.replies[0],
          temperature: result.intelligence.temperature
        }), {
          headers: { "Content-Type": "application/json" }
        });
      },
    },
  },
});

