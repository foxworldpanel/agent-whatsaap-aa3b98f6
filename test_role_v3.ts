import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function test() {
  const sessionId = "a0edecb5-a82b-4641-8905-56f29c35931a";
  const roles = ["user", "assistant", "agent", "customer", "system"];
  
  for (const role of roles) {
    const { error } = await supabaseAdmin
      .from("agent_playground_messages")
      .insert({
        session_id: sessionId,
        role: role,
        content: "teste diagn " + role,
        sequence: Math.floor(Math.random() * 1000000)
      });
    
    if (error) {
      console.log(`Role '${role}': FALHOU (${error.code}: ${error.message})`);
    } else {
      console.log(`Role '${role}': SUCESSO`);
    }
  }
}

test();
