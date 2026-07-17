import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { runAgentV2Turn } from '@/lib/agent-v2.functions';

export const Route = createFileRoute('/api/public/hooks/uazapi-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const correlationId = (globalThis as any).crypto.randomUUID();
        const timestamp = new Date().toISOString();
        const log = (stage: string, details?: any) => {
          console.log(`[V2_DIAGNOSTIC][${correlationId}][${timestamp}][${stage}]`, details || '');
        };

        let payload: any = null;
        try {
          log('AUDIO_WEBHOOK_RECEIVED');
          payload = await request.json();
          log('AUDIO_PAYLOAD_PARSED', { event: payload.event });

          const event = payload.event;
          if (event && !event.includes("message")) {
             log('IGNORED', { reason: 'not_message_event' });
             return new Response("ignored");
          }

          const msg = payload.message ?? payload.data;
          if (!msg || msg.fromMe === true) {
             log('IGNORED', { reason: 'no_msg_or_from_me' });
             return new Response("ignored");
          }

          const chatidRaw = (msg.chatid ?? msg.sender ?? "").toLowerCase();
          if (chatidRaw.includes("@g.us") || chatidRaw.includes("@broadcast") || chatidRaw.includes("status@") || chatidRaw.includes("@newsletter")) {
            log('IGNORED', { reason: 'group_or_broadcast' });
            return new Response("group ignored");
          }

          const phone = chatidRaw.split("@")[0].replace(/\D/g, "");
          if (phone.length > 15 || phone.length < 8) {
            log('INVALID_PHONE', { phone });
            return new Response("invalid phone");
          }

          const { isAuthorizedV2Phone } = await import("@/lib/agent-v2/authorized-phones");
          if (!isAuthorizedV2Phone(phone)) {
            log('UNAUTHORIZED_PHONE', { phone });
            return new Response("unauthorized");
          }

          // 1. Resolve integration and agent
          log('WORKSPACE_LOOKUP_STARTED');
          const { data: integrations, error: intError } = await supabaseAdmin
            .from("integrations")
            .select("*")
            .eq("workspace_id", "bd59fa41-d68d-4ac8-b995-e09ae48f52aa")
            .limit(1);
          
          if (intError) {
             log('WORKSPACE_LOOKUP_ERROR', { error: intError });
             throw intError;
          }
          const integ = integrations?.[0];
          if (!integ) {
             log('WORKSPACE_LOOKUP_EMPTY');
             return new Response("no integration");
          }
          log('WORKSPACE_LOOKUP_OK', { workspaceId: integ.workspace_id });

          const { data: agentConfigs, error: agentError } = await supabaseAdmin
            .from("agent_config")
            .select("*")
            .eq("workspace_id", integ.workspace_id)
            .limit(1);
          
          if (agentError) {
             log('AGENT_LOOKUP_ERROR', { error: agentError });
             throw agentError;
          }
          const agent = agentConfigs?.[0];
          if (!agent) {
             log('AGENT_LOOKUP_EMPTY');
             return new Response("no agent config");
          }
          log('AGENT_LOOKUP_OK');

          // 2. Resolve or create contact first (required for conversation)
          log('CONTACT_LOOKUP_STARTED');
          let { data: contact, error: contactError } = await supabaseAdmin
            .from("contacts")
            .select("*")
            .eq("telefone", phone)
            .eq("workspace_id", integ.workspace_id)
            .maybeSingle();
          
          if (contactError) {
             log('CONTACT_LOOKUP_ERROR', { error: contactError });
             throw contactError;
          }

          if (!contact) {
            log('CONTACT_CREATE_STARTED');
            const { data: newContact, error: createContactError } = await supabaseAdmin
              .from("contacts")
              .insert({
                nome: phone,
                telefone: phone,
                workspace_id: integ.workspace_id,
                user_id: agent.user_id,
                source: 'whatsapp'
              })
              .select()
              .single();
            
            if (createContactError) {
               log('CONTACT_CREATE_ERROR', { error: createContactError });
               throw createContactError;
            }
            contact = newContact;
            log('CONTACT_CREATE_OK');
          } else {
            log('CONTACT_LOOKUP_OK');
          }

          // 3. Resolve conversation
          log('CONVERSATION_LOOKUP_STARTED');
          let { data: conv, error: convError } = await supabaseAdmin
            .from("conversations")
            .select("*")
            .eq("contact_id", contact.id)
            .eq("workspace_id", integ.workspace_id)
            .maybeSingle();
          
          if (convError) {
             log('CONVERSATION_LOOKUP_ERROR', { error: convError });
             throw convError;
          }

          if (!conv) {
            log('CONVERSATION_CREATE_STARTED');
            const { data: newConv, error: createError } = await supabaseAdmin
              .from("conversations")
              .insert({
                workspace_id: integ.workspace_id,
                contact_id: contact.id,
                user_id: agent.user_id,
                status: 'aguardando' as any
              })
              .select()
              .single();
            
            if (createError) {
               log('CONVERSATION_CREATE_ERROR', { error: createError });
               throw createError;
            }
            conv = newConv;
            log('CONVERSATION_CREATE_OK');
          } else {
            log('CONVERSATION_LOOKUP_OK');
          }

          // 4. Resolve Media (Audio Support)
          // 4. Resolve Media (Audio Support)
          const messageType = msg.type || 'text';
          const hasAudio = messageType === 'audio' || messageType === 'ptt';
          
          if (hasAudio) {
            log('AUDIO_DETECTED', { type: messageType });
          }

          const mediaId = String(msg.mediaId || msg.id || "");
          const mediaUrl = String(msg.url || msg.mediaUrl || "");
          const mimeType = String(msg.mimeType || msg.mimetype || "");

          if (hasAudio) {
            log('AUDIO_MEDIA_ID_FOUND', { mediaId });
            log('AUDIO_URL_RESOLVED', { mediaUrl, mimeType });
          }

          // Ensure incomingText is always a string and handle captions vs body
          let incomingText = "";
          if (typeof msg.text === 'string') incomingText = msg.text;
          else if (typeof msg.content === 'string') incomingText = msg.content;
          else if (typeof msg.caption === 'string') incomingText = msg.caption;
          else if (msg.text && typeof msg.text === 'object') {
             // If Uazapi sends text as an object (rare but happens in some versions), 
             // we don't want [object Object]
             incomingText = msg.text.body || "";
          }

          if (hasAudio) {
            log('AUDIO_PIPELINE_PREPARED', { mediaId, mediaUrl, mimeType, caption: incomingText });
          }

          // 5. Load History (Critical for V2)
          log('HISTORY_LOOKUP_STARTED');
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
          log('HISTORY_LOOKUP_OK', { count: shortHistory.length });

          // 6. Run V2 Turn
          log('ORCHESTRATOR_STARTED');
          const v2Result = await runAgentV2Turn({
            correlationId,
            conversationId: conv.id,
            workspaceId: agent.workspace_id,
            phoneNumber: phone,
            currentMessage: incomingText,
            mode: 'receptive',
            executionMode: 'real',
            media: { 
              type: messageType,
              hasAudio,
              mediaId,
              mediaUrl,
              mimeType
            },
            shortHistory,
            toolFixtures: { catalog: [], freeTestServices: [] },
            expected: {
              conversationWorkspaceId: conv.workspace_id ?? agent.workspace_id,
              agentWorkspaceId: agent.workspace_id,
              whatsappWorkspaceId: agent.workspace_id,
              selectedWorkspaceId: agent.workspace_id,
            },
          });
          log('ORCHESTRATOR_OK');

          // 5. Send Reply
          log('WHATSAPP_REPLY_LOGIC_STARTED', { hasAudioResponse: !!v2Result.metrics?.audioResponseUrl });
          const { uazapiSendText, uazapiSendAudio } = await import("@/lib/uazapi.server");
          
          if (integ.uazapi_url && integ.uazapi_token) {
            if (v2Result.metrics?.audioResponseUrl) {
              log('WHATSAPP_SEND_AUDIO_STARTED', { url: v2Result.metrics.audioResponseUrl });
              const sendResult = await uazapiSendAudio(
                { uazapi_url: integ.uazapi_url!, uazapi_token: integ.uazapi_token! },
                phone,
                v2Result.metrics.audioResponseUrl
              );
              log('WHATSAPP_SEND_AUDIO_OK', { sendResult });
            } else {
              log('WHATSAPP_SEND_TEXT_STARTED');
              const sendResult = await uazapiSendText(
                { uazapi_url: integ.uazapi_url!, uazapi_token: integ.uazapi_token! },
                phone,
                v2Result.finalResponse
              );
              log('WHATSAPP_SEND_TEXT_OK', { sendResult });
            }
          } else {
            log('WHATSAPP_SEND_ERROR', { reason: 'missing_credentials' });
          }

          log('TURN_COMPLETED');
          return new Response("ok");
        } catch (error: any) {
          log('CRITICAL_FAILURE', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            cause: error.cause,
            supabaseCode: error.code
          });
          
          // Fallback message to user if possible
          try {
             const { uazapiSendText } = await import("@/lib/uazapi.server");
             const { data: integrations } = await supabaseAdmin.from("integrations").select("*").limit(1);
             const integ = integrations?.[0];
             const chatidRaw = (payload?.message?.chatid ?? payload?.message?.sender ?? payload?.data?.chatid ?? payload?.data?.sender ?? "").toLowerCase();
             const phone = chatidRaw.split("@")[0].replace(/\D/g, "");
             
             if (integ?.uazapi_url && integ?.uazapi_token && phone) {
                await uazapiSendText(
                   { uazapi_url: integ.uazapi_url, uazapi_token: integ.uazapi_token },
                   phone,
                   "Desculpe, tive um problema técnico momentâneo. Como posso te ajudar?"
                );
             }
          } catch (e) {
             // Silently fail the secondary fallback if needed
          }

          return new Response("error logged");
        }
      }
    }
  }
});