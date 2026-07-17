import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getOrCreateConversationV3(workspaceId: string, contactId: string) {
  // Fixed to include required user_id (using service role context)
  const { data: conversation, error } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('contact_id', contactId)
    .single();

  if (conversation) return conversation;

  // Assuming user_id is required, we use the workspace owner or a default admin ID if available.
  // For V3 Mind Global, we use the Mind workspace ID.
  const { data: newConversation, error: createError } = await supabaseAdmin
    .from('conversations')
    .insert([{ 
      workspace_id: workspaceId, 
      contact_id: contactId,
      user_id: 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa' // Linking to Mind Workspace ID as the owner
    }])
    .select('id')
    .single();

  if (createError) throw createError;
  return newConversation;
}
