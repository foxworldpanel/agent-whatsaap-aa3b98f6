import { createFileRoute } from '@tanstack/react-router'
import { v4 as uuidv4 } from 'uuid'
import { normalizeIncomingMessage } from '@/lib/agent-v3/normalizer'
import { resolveWorkspaceV3 } from '@/lib/agent-v3/workspace.server'
import { getOrCreateContactV3 } from '@/lib/agent-v3/contact.server'
import { getOrCreateConversationV3 } from '@/lib/agent-v3/conversation.server'
import { processTextMessageV3 } from '@/lib/agent-v3/text-processor.server'
import { processAudioMessageV3 } from '@/lib/agent-v3/audio-processor.server'
import { sendWhatsAppMessageV3 } from '@/lib/agent-v3/whatsapp.server'

export const Route = createFileRoute('/api/public/hooks/uazapi-webhook-v3')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const correlationId = uuidv4()
        console.log(`[V3_WEBHOOK_RECEIVED] correlationId=${correlationId}`)
        
        try {
          const payload = await request.json()
          
          // 1. Normalize
          const message = normalizeIncomingMessage(payload)
          console.log(`[V3_MESSAGE_NORMALIZED] type=${message.type} correlationId=${correlationId}`)

          // 2. Workspace (Mind Global Hardcoded)
          const workspaceId = await resolveWorkspaceV3()
          console.log(`[V3_WORKSPACE_RESOLVED] workspaceId=${workspaceId} correlationId=${correlationId}`)

          // 3. Contact & Conversation
          const contact = await getOrCreateContactV3(workspaceId, message.phone)
          console.log(`[V3_CONTACT_RESOLVED] contactId=${contact.id} correlationId=${correlationId}`)
          
          const conversation = await getOrCreateConversationV3(workspaceId, contact.id)
          console.log(`[V3_CONVERSATION_RESOLVED] conversationId=${conversation.id} correlationId=${correlationId}`)

          let responseText = ""

          // 4. Process by Type
          if (message.type === 'audio') {
            console.log(`[V3_AUDIO_PROCESSING_STARTED] correlationId=${correlationId}`)
            responseText = await processAudioMessageV3(message, correlationId)
          } else {
            console.log(`[V3_TEXT_PROCESSING_STARTED] correlationId=${correlationId}`)
            responseText = await processTextMessageV3(message, correlationId)
          }

          // 5. Send
          console.log(`[V3_WHATSAPP_SEND_STARTED] correlationId=${correlationId}`)
          await sendWhatsAppMessageV3(message.phone, responseText, correlationId)
          console.log(`[V3_WHATSAPP_SEND_OK] correlationId=${correlationId}`)
          
          console.log(`[V3_TURN_COMPLETED] correlationId=${correlationId}`)
          return new Response(JSON.stringify({ success: true, correlationId }), { status: 200 })
        } catch (error: any) {
          console.error(`[V3_ERROR] correlationId=${correlationId} stage=global error=${error.message}`, error.stack)
          return new Response(JSON.stringify({ error: error.message, correlationId }), { status: 500 })
        }
      }
    }
  }
})
