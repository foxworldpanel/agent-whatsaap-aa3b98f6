import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function test() {
  const userId = "bd59fa41-a3f2-4917-8654-e758a5c379a2"; 
  
  // Criar uma sessão válida
  const { data: session, error: sessErr } = await supabaseAdmin
    .from("agent_playground_sessions")
    .insert({ user_id: userId, name: "Teste Diagnóstico" })
    .select()
    .single();
    
  if (sessErr) {
    console.error("Erro ao criar sessão:", sessErr);
    return;
  }
  
  const sessionId = session.id;
  console.log("Sessão criada:", sessionId);

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
      console.log(`Role '${role}': FALHOU (${error.code}: ${error.message})`);
    } else {
      console.log(`Role '${role}': SUCESSO`);
    }
  }
}

test();
