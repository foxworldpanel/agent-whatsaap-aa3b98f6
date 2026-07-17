import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { runAgentV2Turn } from '@/lib/agent-v2.functions';

export const Route = createFileRoute('/api/public/hooks/uazapi-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const correlationId = `v2_hook_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const log = (stage: string, details?: any) => {
          console.log(`[V2_WEBHOOK][${correlationId}][${stage}]`, details || '');
        };

        let payload: any = null;
        try {
          payload = await request.json();
          log('RECEIVED_PAYLOAD', { event: payload.event });

          const msg = payload.message ?? payload.data;
          if (!msg || msg.fromMe === true) return new Response("ignored");

          const chatidRaw = String(msg.chatid ?? msg.sender ?? "").toLowerCase();
          if (chatidRaw.includes("@g.us") || chatidRaw.includes("@broadcast") || chatidRaw.includes("status@")) {
            return new Response("group ignored");
          }

          const phone = chatidRaw.split("@")[0].replace(/\D/g, "");
          const { isAuthorizedV2Phone } = await import("@/lib/agent-v2/authorized-phones");
          if (!isAuthorizedV2Phone(phone)) {
            log('UNAUTHORIZED_PHONE', { phone });
            return new Response("unauthorized");
          }

          // Force Mind Workspace
          const workspaceId = "bd59fa41-d68d-4ac8-b995-e09ae48f52aa";

          // 1. Resolve agent and integration in parallel
          const [agentRes, integRes] = await Promise.all([
            supabaseAdmin.from("agent_config").select("*").eq("workspace_id", workspaceId).maybeSingle(),
            supabaseAdmin.from("integrations").select("*").eq("workspace_id", workspaceId).limit(1)
          ]);

          const agent = agentRes.data;
          const integ = integRes.data?.[0];

          if (!agent || !integ) {
            log('MISSING_CONFIG', { hasAgent: !!agent, hasInteg: !!integ });
            return new Response("missing config");
          }

          // 2. Resolve contact and conversation
          let { data: contact } = await supabaseAdmin.from("contacts").select("id").eq("telefone", phone).eq("workspace_id", workspaceId).maybeSingle();
          if (!contact) {
            const { data: newContact } = await supabaseAdmin.from("contacts").insert({
              nome: phone, telefone: phone, workspace_id: workspaceId, user_id: agent.user_id, source: 'whatsapp'
            }).select("id").single();
            contact = newContact;
          }

          if (!contact) throw new Error("Could not resolve contact");

          let { data: conv } = await supabaseAdmin.from("conversations").select("id, workspace_id").eq("contact_id", contact.id).eq("workspace_id", workspaceId).maybeSingle();
          if (!conv) {
            const { data: newConv } = await supabaseAdmin.from("conversations").insert({
              workspace_id: workspaceId, contact_id: contact.id, user_id: agent.user_id, status: 'aguardando'
            }).select("id, workspace_id").single();
            conv = newConv;
          }

          if (!conv) throw new Error("Could not resolve conversation");

          // 3. Extract Message Content
          const messageType = msg.type || 'text';
          const hasAudio = messageType === 'audio' || messageType === 'ptt';
          const mediaId = String(msg.mediaId || msg.id || "");
          const mediaUrl = String(msg.url || msg.mediaUrl || "");
          const mimeType = String(msg.mimeType || msg.mimetype || "");

          let incomingText = "";
          if (typeof msg.text === 'string') incomingText = msg.text;
          else if (typeof msg.content === 'string') incomingText = msg.content;
          else if (typeof msg.caption === 'string') incomingText = msg.caption;
          else if (msg.text && typeof msg.text === 'object') incomingText = msg.text.body || "";

          // 4. Load History
          const { data: historyData } = await supabaseAdmin
            .from("messages")
            .select("sender, body")
            .eq("conversation_id", conv.id)
            .order("created_at", { ascending: false })
            .limit(10);
          
          const shortHistory = (historyData || [])
            .reverse()
            .map(m => ({ 
              sender: m.sender === 'agente' ? 'agente' as const : 'cliente' as const, 
              body: String(m.body || "") 
            }));

          // 5. Run V2 Turn
          log('ORCHESTRATOR_START');
          const v2Result = await runAgentV2Turn({
            correlationId,
            conversationId: conv.id,
            workspaceId,
            phoneNumber: phone,
            currentMessage: incomingText,
            media: { type: messageType as any, hasAudio, mediaId, mediaUrl, mimeType },
            shortHistory,
            executionMode: 'real'
          });
          log('ORCHESTRATOR_OK', { finalResponse: v2Result.finalResponse.slice(0, 30) });

          // 6. Send Reply
          const { uazapiSendText, uazapiSendAudio } = await import("@/lib/uazapi.server");
          if (integ.uazapi_url && integ.uazapi_token) {
            if (v2Result.metrics?.audioResponseUrl) {
              log('SENDING_AUDIO', { url: v2Result.metrics.audioResponseUrl });
              await uazapiSendAudio({ uazapi_url: integ.uazapi_url, uazapi_token: integ.uazapi_token }, phone, v2Result.metrics.audioResponseUrl);
            } else {
              log('SENDING_TEXT');
              await uazapiSendText({ uazapi_url: integ.uazapi_url, uazapi_token: integ.uazapi_token }, phone, v2Result.finalResponse);
            }
          }

          return new Response("ok");
        } catch (error: any) {
          log('CRITICAL_ERROR', { message: error.message, stack: error.stack?.split('\n')[0] });
          
          try {
             const chatidRaw = (payload?.message?.chatid ?? payload?.message?.sender ?? payload?.data?.chatid ?? payload?.data?.sender ?? "").toLowerCase();
             const phone = chatidRaw.split("@")[0].replace(/\D/g, "");
             if (phone) {
                const { uazapiSendText } = await import("@/lib/uazapi.server");
                const { data: integ } = await supabaseAdmin.from("integrations").select("*").eq("workspace_id", "bd59fa41-d68d-4ac8-b995-e09ae48f52aa").maybeSingle();
                if (integ?.uazapi_url && integ?.uazapi_token) {
                   await uazapiSendText({ uazapi_url: integ.uazapi_url, uazapi_token: integ.uazapi_token }, phone, "Desculpe, tive um problema técnico momentâneo. Como posso te ajudar?");
                }
             }
          } catch (e) {}

          return new Response("error");
        }
      }
    }
  }
});