import { createFileRoute } from "@tanstack/react-router";
import { assertCronAuthorized } from "@/lib/cron-auth.server";
import { dispatchCustomerTurnBatch } from "@/lib/agent-v3/customer-turn-dispatch.server";

export const AGENT_CUSTOMER_TURN_DISPATCH_MAX_PER_RUN = 20;

/**
 * Stage C+D durable semantic-turn dispatcher.
 * Eligible inbound messages are already durable Stage B jobs and members of a
 * collecting Customer Turn. This endpoint waits for the natural-silence gate,
 * claims one turn per conversation and executes one logical Agent V3 decision
 * for that sealed turn.
 */
export const Route = createFileRoute("/api/public/hooks/agent-inbound-dispatcher")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = assertCronAuthorized(request);
        if (unauth) return unauth;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const workerId = `agent-customer-turn-dispatcher:${crypto.randomUUID()}`;

        try {
          const result = await dispatchCustomerTurnBatch(
            supabaseAdmin,
            workerId,
            AGENT_CUSTOMER_TURN_DISPATCH_MAX_PER_RUN,
          );
          return Response.json({
            ok: true,
            mode: "customer_turn",
            maxPerRun: AGENT_CUSTOMER_TURN_DISPATCH_MAX_PER_RUN,
            ...result,
          });
        } catch (error) {
          console.error("[AGENT-CUSTOMER-TURN-DISPATCHER] durable dispatch failed", error);
          return Response.json(
            { ok: false, error: "agent customer turn dispatch failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
