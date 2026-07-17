import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getOrCreateContactV3(workspaceId: string, phone: string) {
  const { data: contact, error } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('phone', phone)
    .single();

  if (contact) return contact;

  const { data: newContact, error: createError } = await supabaseAdmin
    .from('contacts')
    .insert([{ workspace_id: workspaceId, phone, name: phone }])
    .select('id')
    .single();

  if (createError) throw createError;
  return newContact;
}
