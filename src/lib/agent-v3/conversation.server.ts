import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getOrCreateConversationV3(workspaceId: string, contactId: string) {
  const { data: conversation, error } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('contact_id', contactId)
    .single();

  if (conversation) return conversation;

  const { data: newConversation, error: createError } = await supabaseAdmin
    .from('conversations')
    .insert([{ workspace_id: workspaceId, contact_id: contactId }])
    .select('id')
    .single();

  if (createError) throw createError;
  return newConversation;
}
