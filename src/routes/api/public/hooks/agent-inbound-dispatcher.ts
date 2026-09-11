import { createFileRoute } from "@tanstack/react-router";
import { assertCronAuthorized } from "@/lib/cron-auth.server";
import {
  AGENT_INBOUND_DISPATCH_MAX_PER_RUN,
  dispatchAgentInboundBatch,
} from "@/lib/agent-v3/inbound-dispatch-policy.server";

/**
 * Stage B durable pending-job dispatcher.
 *
 * Webhook execution remains the fast path. This endpoint is the bounded safety
 * net that claims pending jobs and executes the exact same shared Agent V3
 * runtime in a fresh worker process.
 */
export const Route = createFileRoute("/api/public/hooks/agent-inbound-dispatcher")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = assertCronAuthorized(request);
        if (unauth) return unauth;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const workerId = `agent-inbound-dispatcher:${crypto.randomUUID()}`;

        try {
          const result = await dispatchAgentInboundBatch(
            supabaseAdmin,
            workerId,
            AGENT_INBOUND_DISPATCH_MAX_PER_RUN,
          );

          return Response.json({
            ok: true,
            maxPerRun: AGENT_INBOUND_DISPATCH_MAX_PER_RUN,
            ...result,
          });
        } catch (error) {
          console.error("[AGENT-INBOUND-DISPATCHER] durable dispatch failed", error);
          return Response.json(
            { ok: false, error: "agent inbound dispatch failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
