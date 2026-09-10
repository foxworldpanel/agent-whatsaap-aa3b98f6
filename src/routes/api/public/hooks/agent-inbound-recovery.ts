import { createFileRoute } from "@tanstack/react-router";
import { assertCronAuthorized } from "@/lib/cron-auth.server";
import { AGENT_INBOUND_MAX_SAFE_ATTEMPTS } from "@/lib/agent-v3/inbound-jobs.server";
import { recoverAgentInboundDispatcherClaims } from "@/lib/agent-v3/inbound-job-dispatch.server";

const DEFAULT_STALE_MS = 5 * 60 * 1000;

/**
 * Stage B recovery hook.
 *
 * This endpoint intentionally performs only ownership recovery. It does not
 * replay `processing` work: once Agent V3 crossed the external side-effect
 * boundary, stale work is quarantined to needs_review by the SQL recovery RPC.
 * `processing_safe` work may be requeued because no runtime side effect has
 * started yet.
 *
 * Pending execution is wired separately through the shared dispatcher/runtime
 * boundary; keeping recovery independent makes this hook safe to schedule now.
 */
export const Route = createFileRoute("/api/public/hooks/agent-inbound-recovery")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = assertCronAuthorized(request);
        if (unauth) return unauth;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const staleBefore = new Date(Date.now() - DEFAULT_STALE_MS).toISOString();

        try {
          const recovered = await recoverAgentInboundDispatcherClaims(
            supabaseAdmin,
            DEFAULT_STALE_MS,
            AGENT_INBOUND_MAX_SAFE_ATTEMPTS,
          );

          return Response.json({
            ok: true,
            staleBefore,
            maxSafeAttempts: AGENT_INBOUND_MAX_SAFE_ATTEMPTS,
            requeued: recovered.requeued,
            needsReview: recovered.review,
          });
        } catch (error) {
          console.error("[AGENT-INBOUND-RECOVERY] durable recovery failed", error);
          return Response.json(
            { ok: false, error: "agent inbound recovery failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
