import { createFileRoute } from "@tanstack/react-router";
import { assertCronAuthorized } from "@/lib/cron-auth.server";
import { AGENT_INBOUND_MAX_SAFE_ATTEMPTS } from "@/lib/agent-v3/inbound-jobs.server";
import { recoverAgentInboundDispatcherClaims } from "@/lib/agent-v3/inbound-recovery.server";
import { DB_CONVERSATION_LOCK_STALE_MS,recoverStaleAgentConversationLocks } from "@/lib/agent-v3/conversation-lock.server";

const DEFAULT_STALE_MS = 5 * 60 * 1000;
// Welcome Funnel is synchronous and may contain five independently configured
// delays of up to 180s. Its runtime and generation-lock recovery deliberately
// share the canonical conversation-lock lease horizon.
const GENERATION_LOCK_STALE_MS = DB_CONVERSATION_LOCK_STALE_MS;
const WELCOME_FUNNEL_STALE_MS = DB_CONVERSATION_LOCK_STALE_MS;

/**
 * Stage B / shared conversation ownership recovery hook.
 *
 * This endpoint intentionally performs only ownership recovery. It does not
 * replay `processing` work: once Agent V3 or Welcome Funnel crossed an external
 * side-effect boundary, stale work is quarantined to needs_review. `processing_safe`
 * work may be requeued because no runtime side effect has started yet.
 */
export const Route = createFileRoute("/api/public/hooks/agent-inbound-recovery")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = assertCronAuthorized(request);
        if (unauth) return unauth;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = Date.now();
        const staleBefore = new Date(now - DEFAULT_STALE_MS).toISOString();
        const generationLockStaleBefore = new Date(now - GENERATION_LOCK_STALE_MS).toISOString();
        const welcomeFunnelStaleBefore = new Date(now - WELCOME_FUNNEL_STALE_MS).toISOString();

        try {
          const recovered = await recoverAgentInboundDispatcherClaims(
            supabaseAdmin,
            DEFAULT_STALE_MS,
            AGENT_INBOUND_MAX_SAFE_ATTEMPTS,
          );
          const { data: staleFunnelReview, error: staleFunnelError } = await supabaseAdmin.rpc(
            "recover_stale_welcome_funnel_executions",
            {
              p_stale_before: welcomeFunnelStaleBefore,
              p_generation_lock_stale_before: generationLockStaleBefore,
              p_limit: 50,
            },
          );
          if (staleFunnelError) throw staleFunnelError;

          const recoveredConversationLocks = await recoverStaleAgentConversationLocks(
            supabaseAdmin,
            GENERATION_LOCK_STALE_MS,
          );

          return Response.json({
            ok: true,
            staleBefore,
            generationLockStaleBefore,
            welcomeFunnelStaleBefore,
            maxSafeAttempts: AGENT_INBOUND_MAX_SAFE_ATTEMPTS,
            requeued: recovered.requeued,
            needsReview: recovered.review,
            welcomeFunnelNeedsReview: Number(staleFunnelReview || 0),
            recoveredConversationLocks,
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
