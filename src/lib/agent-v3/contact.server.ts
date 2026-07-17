import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getOrCreateContactV3(workspaceId: string, phone: string) {
  // Querying without any status filter to avoid type mismatches
  const { data: contact, error } = await (supabaseAdmin
    .from('contacts')
    .select('id') as any)
    .eq('workspace_id', workspaceId)
    .eq('perfil', phone)
    .single();

  if (contact) return contact;

  const payload: any = { 
    workspace_id: workspaceId, 
    perfil: phone, 
    nome: phone
  };

  const { data: newContact, error: createError } = await (supabaseAdmin
    .from('contacts')
    .insert([payload]) as any)
    .select('id')
    .single();

  if (createError) throw createError;
  return newContact;
}
