import { supabaseAdmin } from "./src/integrations/supabase/client.server";
async function find() {
  const { data, error } = await supabaseAdmin.from("workspaces").select("id, user_id").eq("id", "bd59fa41-d68d-4ac8-b995-e09ae48f52aa").single();
  if (error) console.error(error);
  else console.log("Owner user_id:", data.user_id);
}
find();
