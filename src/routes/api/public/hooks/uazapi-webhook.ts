import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { runAgentV2Turn } from '@/lib/agent-v2.functions';

export const Route = createFileRoute('/api/public/hooks/uazapi-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.json();
        const event = payload.event;
        if (event && !event.includes("message")) return new Response("ignored");

        const msg = payload.message ?? payload.data;
        if (!msg || msg.fromMe === true) return new Response("ignored");

        const chatidRaw = (msg.chatid ?? msg.sender ?? "").toLowerCase();
        if (chatidRaw.includes("@g.us") || chatidRaw.includes("@broadcast") || chatidRaw.includes("status@") || chatidRaw.includes("@newsletter")) {
          return new Response("group ignored");
        }

        const phone = chatidRaw.split("@")[0].replace(/\D/g, "");
        if (phone.length > 15 || phone.length < 8) return new Response("invalid phone");

        const { isAuthorizedV2Phone } = await import("@/lib/agent-v2/authorized-phones");
        if (!isAuthorizedV2Phone(phone)) return new Response("unauthorized");

        // 1. Resolve integration and agent
        const { data: integrations } = await supabaseAdmin
          .from("integrations")
          .select("*")
          .limit(1);
        
        const integ = integrations?.[0];
        if (!integ) return new Response("no integration");

        const { data: agentConfigs } = await supabaseAdmin
          .from("agent_config")
          .select("*")
          .eq("workspace_id", integ.workspace_id)
          .limit(1);
        
        const agent = agentConfigs?.[0];
        if (!agent) return new Response("no agent config");

        // 2. Resolve conversation
        const { data: conv } = await supabaseAdmin
          .from("conversations")
          .select("*")
          .eq("workspace_id", integ.workspace_id)
          .limit(1)
          .maybeSingle();
        
        if (!conv) return new Response("no conversation");

        // 3. Run V2 Turn
        const v2Result = await runAgentV2Turn({
          conversationId: conv.id,
          workspaceId: agent.workspace_id,
          phoneNumber: phone,
          currentMessage: msg.text ?? msg.content ?? "",
          mode: 'receptive',
          executionMode: 'real',
          media: { type: 'text' },
          shortHistory: [],
          toolFixtures: { catalog: [], freeTestServices: [] },
          expected: {
            conversationWorkspaceId: conv.workspace_id ?? agent.workspace_id,
            agentWorkspaceId: agent.workspace_id,
            whatsappWorkspaceId: agent.workspace_id,
            selectedWorkspaceId: agent.workspace_id,
          },
        });

        // 4. Send Reply
        const { uazapiSendText } = await import("@/lib/uazapi.server");
        if (integ.uazapi_url && integ.uazapi_token) {
          await uazapiSendText(
            { uazapi_url: integ.uazapi_url, uazapi_token: integ.uazapi_token },
            phone,
            v2Result.finalResponse
          );
        }

        return new Response("ok");
      }
    }
  }
});
