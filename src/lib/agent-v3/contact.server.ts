import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getOrCreateContactV3(workspaceId: string, phone: string) {
  // Try to find the contact first without filtering by status to avoid enum issues
  const { data: contact, error } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('perfil', phone)
    .single();

  if (contact) return contact;

  // Insert with minimal required fields. Using 'any' for the whole object to bypass strict type check for now.
  const payload: any = { 
    workspace_id: workspaceId, 
    perfil: phone, 
    nome: phone,
    status: 'nao_abordado'
  };

  const { data: newContact, error: createError } = await supabaseAdmin
    .from('contacts')
    .insert([payload])
    .select('id')
    .single();

  if (createError) throw createError;
  return newContact;
}
