import { supabase } from "./src/integrations/supabase/client";
async function listAll() {
  const { data, error } = await supabase.from("agent_modules_v3").select("id, key, workspace_id, name, content");
  if (error) console.error(error);
  else console.table(data.map(m => ({ ...m, content: m.content?.substring(0, 20) + "..." })));
}
listAll();
