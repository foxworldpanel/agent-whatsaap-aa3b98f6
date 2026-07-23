import { createFileRoute } from "@tanstack/react-router";
import { runAgentV3Turn } from "@/lib/agent-v3/orchestrator.server";

// [V3-TEST] Webhook receiver isolado para testes da arquitetura V3.
// URL: {site}/api/public/hooks/v3-test-webhook
// Desabilitado por padrão. Ative apenas em ambiente controlado com V3_TEST_WEBHOOK_ENABLED=true.

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
        if (process.env.V3_TEST_WEBHOOK_ENABLED !== "true") {
          return new Response("not found", { status: 404 });
        }

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
          .select("user_id, workspace_id")
          .eq("uazapi_token", token)
          .maybeSingle();
        const userId = num?.user_id;
        if (!userId) {
          return new Response("unauthorized (unknown instance)", { status: 401 });
        }
        const workspaceId = num?.workspace_id?.trim();
        if (!workspaceId) {
          return new Response("workspace configuration missing", { status: 503 });
        }

        const phone = payload.message?.chatid?.split("@")[0] || payload.message?.sender?.split("@")[0];
        if (payload.message?.fromMe) {
          return new Response("ok");
        }

        const message = payload.message?.text?.trim() || "";
        if (!message) {
          return new Response("ok (empty message)");
        }

        // Chama V3
        const result = await runAgentV3Turn({
          userId,
          workspaceId,
          phone,
          message,
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

