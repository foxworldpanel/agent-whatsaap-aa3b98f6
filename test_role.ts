import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function test() {
  const sessionId = "00000000-0000-0000-0000-000000000000";
  const roles = ["user", "assistant", "agent", "customer", "system"];
  
  for (const role of roles) {
    const { error } = await supabaseAdmin
      .from("agent_playground_messages")
      .insert({
        session_id: sessionId,
        role: role,
        content: "teste " + role,
        sequence: Math.floor(Math.random() * 1000000)
      });
    
    if (error) {
      console.log(`Role '${role}': FALHOU (${error.message})`);
    } else {
      console.log(`Role '${role}': SUCESSO`);
    }
  }
}

test();
