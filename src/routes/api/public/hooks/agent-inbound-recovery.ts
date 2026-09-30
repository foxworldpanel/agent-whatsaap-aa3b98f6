import { createFileRoute } from "@tanstack/react-router";
import { assertCronAuthorized } from "@/lib/cron-auth.server";
import { AGENT_INBOUND_MAX_SAFE_ATTEMPTS } from "@/lib/agent-v3/inbound-jobs.server";
import { recoverAgentInboundDispatcherClaims } from "@/lib/agent-v3/inbound-recovery.server";
import { DB_CONVERSATION_LOCK_STALE_MS,recoverStaleAgentConversationLocks } from "@/lib/agent-v3/conversation-lock.server";
import { resumeRecoveredWelcomeFunnel } from "@/lib/welcome-funnel-orchestrator.server";

const DEFAULT_STALE_MS = 5 * 60 * 1000;
// Welcome Funnel is synchronous and may contain five independently configured
// delays of up to 180s. Its runtime and generation-lock recovery deliberately
// share the canonical conversation-lock lease horizon.
const GENERATION_LOCK_STALE_MS = DB_CONVERSATION_LOCK_STALE_MS;
const WELCOME_FUNNEL_STALE_MS = DB_CONVERSATION_LOCK_STALE_MS;
const WELCOME_FUNNEL_RESUME_LIMIT = 20;

async function resumeZeroEffectRecoveredFunnels(supabaseAdmin:any){
 // First convert only the exact zero-effect stale quarantine back to running.
 // The RPC is the safety fence: it verifies exact identity, no checkpoint,
 // no historical baseline and no Agent outbound evidence before recovery.
 const {data:reviewRows,error:reviewError}=await supabaseAdmin.from("welcome_funnel_execution_state").select("funnel_id,contact_id,conversation_id,user_id,workspace_id").eq("status","needs_review").is("last_completed_step",null).eq("error_message","stale Welcome Funnel runtime recovered after uncertain external side effects").limit(WELCOME_FUNNEL_RESUME_LIMIT);if(reviewError)throw reviewError;
 let recovered=0,recoveryRejected=0;
 for(const row of reviewRows||[]){const {data,error}=await supabaseAdmin.rpc("recover_zero_effect_stale_welcome_funnel",{p_funnel_id:row.funnel_id,p_contact_id:row.contact_id,p_conversation_id:row.conversation_id,p_user_id:row.user_id,p_workspace_id:row.workspace_id});if(error)throw error;if(data===true)recovered+=1;else recoveryRejected+=1;}

 const {data:rows,error}=await supabaseAdmin.from("welcome_funnel_execution_state").select("funnel_id,contact_id,conversation_id,user_id,workspace_id,status,last_completed_step,error_message").eq("status","running").is("last_completed_step",null).limit(WELCOME_FUNNEL_RESUME_LIMIT);if(error)throw error;
 let completed=0,busy=0,failed=0;
 for(const row of rows||[]){try{
  const {data:funnel,error:funnelError}=await supabaseAdmin.from("welcome_funnels").select("id,name,delay_seconds,steps,whatsapp_number_id,enabled").eq("id",row.funnel_id).eq("workspace_id",row.workspace_id).eq("enabled",true).maybeSingle();if(funnelError)throw funnelError;if(!funnel)continue;
  const {data:contact,error:contactError}=await supabaseAdmin.from("contacts").select("telefone").eq("id",row.contact_id).maybeSingle();if(contactError)throw contactError;if(!contact?.telefone)continue;
  const {data:number,error:numberError}=await supabaseAdmin.from("whatsapp_numbers").select("uazapi_url,uazapi_token").eq("id",funnel.whatsapp_number_id).eq("workspace_id",row.workspace_id).maybeSingle();if(numberError)throw numberError;if(!number?.uazapi_url||!number?.uazapi_token)continue;
  const result=await resumeRecoveredWelcomeFunnel({supabaseAdmin,funnel,contactId:row.contact_id,conversationId:row.conversation_id,userId:row.user_id,workspaceId:row.workspace_id,phone:contact.telefone,creds:{uazapi_url:number.uazapi_url,uazapi_token:number.uazapi_token}});if(result.status==="completed")completed+=1;else if(result.status==="busy")busy+=1;
 }catch(error){failed+=1;console.error("[WELCOME-FUNNEL-RECOVERY] safe resume failed",{conversationId:row.conversation_id,error});}}
 return{recovered,recoveryRejected,completed,busy,failed};
}

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

          // Generic lock recovery handles ordinary orphan ownership but skips a
          // running Funnel. Funnel recovery then owns that coupled case: under
          // the same fence it quarantines uncertainty before removing a stale
          // Funnel lock. Fresh generation ownership always blocks quarantine.
          const recoveredConversationLocks = await recoverStaleAgentConversationLocks(
            supabaseAdmin,
            GENERATION_LOCK_STALE_MS,
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

          // Run the exact zero-effect repair after stale quarantine so funnels
          // quarantined in this same cron pass can be safely resumed immediately.
          // Partial/checkpointed executions remain needs_review and are never replayed.
          const resumedWelcomeFunnels = await resumeZeroEffectRecoveredFunnels(supabaseAdmin);

          return Response.json({
            ok: true,
            staleBefore,
            generationLockStaleBefore,
            welcomeFunnelStaleBefore,
            maxSafeAttempts: AGENT_INBOUND_MAX_SAFE_ATTEMPTS,
            requeued: recovered.requeued,
            needsReview: recovered.review,
            welcomeFunnelNeedsReview: Number(staleFunnelReview || 0),
            resumedWelcomeFunnels,
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
