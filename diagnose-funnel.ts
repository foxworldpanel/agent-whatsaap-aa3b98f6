import { supabaseAdmin as supabase } from "./src/integrations/supabase/client.server";

async function diagnose() {
  console.log("--- DIAGNÓSTICO DE FUNIL ---");
  const { data: funnels, error } = await supabase
    .from("welcome_funnels")
    .select("*")
    .eq("workspace_id", "bd59fa41-2c97-4008-872e-36055106e572")
    .eq("enabled", true);

  if (error) {
    console.error("Erro ao buscar funis:", error);
    return;
  }

  console.log(`Encontrados ${funnels?.length || 0} funis ativos.`);
  
  for (const f of (funnels || [])) {
    console.log(`\nFunil: ${f.name} (ID: ${f.id})`);
    console.log(`Gatilhos: "${f.trigger_keywords}"`);
    
    // Simular o matching que o webhook faz
    const testMessage = "Olá! Tenho interesse em divulgar minha música.";
    
    function normalizeFunnelText(value: string): string {
      return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    }

    function funnelMatchesMessage(triggerKeywords: string, message: string): boolean {
      const normalizedMessage = normalizeFunnelText(message);
      if (!normalizedMessage) return false;

      const genericGreetings = new Set(["oi", "ola", "bom dia", "boa tarde", "boa noite"]);
      const triggers = String(triggerKeywords || "")
        .split(",")
        .map((item) => normalizeFunnelText(item))
        .filter((item) => Boolean(item) && !genericGreetings.has(item));

      if (triggers.length === 0) return false;
      return triggers.some((trigger) => normalizedMessage.includes(trigger));
    }

    const matches = funnelMatchesMessage(f.trigger_keywords, testMessage);
    console.log(`Match com a frase do cliente: ${matches ? "SIM ✅" : "NÃO ❌"}`);
  }
}

diagnose();
