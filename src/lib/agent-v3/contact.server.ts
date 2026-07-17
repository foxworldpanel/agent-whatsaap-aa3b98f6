import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getOrCreateContactV3(workspaceId: string, phone: string) {
  const { data: contact, error } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('perfil', phone)
    .single();

  if (contact) return contact;

  const { data: newContact, error: createError } = await supabaseAdmin
    .from('contacts')
    .insert([{ 
      workspace_id: workspaceId, 
      perfil: phone, 
      nome: phone,
      status: 'ativo' as const // Explicitly using a valid enum value
    }])
    .select('id')
    .single();

  if (createError) throw createError;
  return newContact;
}
