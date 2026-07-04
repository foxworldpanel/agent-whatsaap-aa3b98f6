import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getSharedUazapiUserIds(context: { userId: string }) {
  const { data: ownIntegration, error } = await supabaseAdmin
    .from("integrations")
    .select("uazapi_token")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const token = ownIntegration?.uazapi_token;
  if (!token) return [context.userId];

  const { data: sharedRows, error: sharedError } = await supabaseAdmin
    .from("integrations")
    .select("user_id")
    .eq("uazapi_token", token);
  if (sharedError) throw new Error(sharedError.message);

  return Array.from(
    new Set([context.userId, ...(sharedRows ?? []).map((row) => row.user_id as string)]),
  );
}