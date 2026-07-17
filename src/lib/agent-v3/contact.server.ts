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
      status: 'nao_abordado' as any // Use 'any' to bypass strict enum mismatch until correct value is used
    }])
    .select('id')
    .single();

  if (createError) throw createError;
  return newContact;
}
