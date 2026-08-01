import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function run() {
  const phone = "5511970116430";
  console.log(`[AUDIT] Buscando logs detalhados para o número: ${phone}`);

  // Buscamos logs da tabela agent_logs que o orquestrador V3 usa para telemetria
  const { data: logs, error } = await supabaseAdmin
    .from("agent_logs")
    .select("*")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Erro ao buscar agent_logs:", error);
  } else if (logs) {
    console.log("--- LOGS DE TELEMETRIA (agent_logs) ---");
    // Inverter para mostrar ordem cronológica se desejado, mas vamos manter a ordem que o usuário pediu
    logs.reverse().forEach(log => {
      console.log(`[${log.created_at}] [${log.type}] ${log.summary}`);
      if (log.metadata) console.log("Metadata:", JSON.stringify(log.metadata));
    });
  }

  // O webhook também pode estar logando no stdout que capturamos se rodarmos uma simulação.
  // Mas o usuário quer os logs REAIS das mensagens que ele mandou.
  // Como não temos acesso direto ao buffer de stdout do processo 'vite' persistente,
  // vamos assumir que as marcações [AUDIT] e RETURN-PONTO foram salvas em algum lugar ou estão nos logs de execução se capturados.
  
  // Vamos tentar localizar se houve algum erro recente ou log de sistema que capturou os consoles.
}

run();
