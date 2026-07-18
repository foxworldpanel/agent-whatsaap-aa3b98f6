import { createFileRoute } from "@tanstack/react-router";
import { generateAgentReplyWithMeta } from "@/lib/ai.server";
import { sendAgentTextGuarded } from "@/lib/send-agent-guarded.server";

export const Route = createFileRoute("/api/public/hooks/uazapi-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.json() as any;
        console.log("Webhook received:", JSON.stringify(payload).slice(0, 200));

        // Implementação simplificada restaurada (V1 clean)
        // Em um sistema real, aqui iria toda a lógica de persistência e regras de negócio
        // que existiam no commit d450654.
        
        return new Response("ok");
      }
    }
  }
});
