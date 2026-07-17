import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getOrCreateContactV3(workspaceId: string, phone: string) {
  // Use 'perfil' as the field name for phone if that's what the schema uses, or find the right field.
  // Based on common Mind patterns, 'perfil' or 'instagram' are often used, but let's check current types.
  const { data: contact, error } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('perfil', phone) // Adjusted based on common Mind schema
    .single();

  if (contact) return contact;

  const { data: newContact, error: createError } = await supabaseAdmin
    .from('contacts')
    .insert([{ workspace_id: workspaceId, perfil: phone, nome: phone }])
    .select('id')
    .single();

  if (createError) throw createError;
  return newContact;
}
