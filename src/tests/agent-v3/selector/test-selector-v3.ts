
import { selectModulesV3 } from "@/lib/agent-v3/selector/module-selector.server";

async function runTests() {
  const enabledModules = [
    "identidade",
    "regras_gerais",
    "comportamento_humano",
    "instagram",
    "youtube",
    "spotify",
    "tiktok",
    "fluxo_vendas",
    "tabela_precos",
    "fechamento_vendas",
    "suporte_pos_compra",
    "pagamentos",
    "objecoes_vendas",
    "prova_social"
  ];

  const scenarios = [
    {
      name: "Cenário 1 — Saudação",
      message: "Oi",
      history: [],
      expectedIntent: "saudacao",
      notExpected: ["tabela_precos", "fechamento_vendas"]
    },
    {
      name: "Cenário 2 — Contexto em duas mensagens",
      message: "Instagram",
      history: [
        { role: "customer", content: "Quero seguidores" },
        { role: "agent", content: "Para qual rede?" }
      ],
      expectedPlatform: "instagram",
      expectedModules: ["instagram", "fluxo_vendas"]
    },
    {
      name: "Cenário 3 — Segurança com contexto",
      message: "É seguro?",
      history: [
        { role: "customer", content: "Quero 5 mil inscritos no YouTube" },
        { role: "agent", content: "Claro, posso te ajudar. É um excelente investimento." }
      ],
      expectedPlatform: "youtube",
      expectedModules: ["youtube", "objecoes_vendas"]
    },
    {
      name: "Cenário 4 — Pagamento",
      message: "Já fiz o Pix",
      history: [
        { role: "customer", content: "Quero comprar plays no Spotify" },
        { role: "agent", content: "Perfeito, segue o link de pagamento." }
      ],
      expectedIntent: "pagamento",
      expectedModules: ["spotify", "pagamentos"]
    },
    {
      name: "Cenário 5 — Suporte",
      message: "Meu pedido caiu",
      history: [
        { role: "customer", content: "Comprei seguidores no Instagram" },
        { role: "agent", content: "Entendido, seu pedido foi processado." }
      ],
      expectedIntent: "suporte",
      expectedModules: ["instagram", "suporte_pos_compra"]
    },
    {
      name: "Cenário 6 — Mensagem ambígua",
      message: "Quanto fica?",
      history: [
        { role: "customer", content: "Quero 1000 seguidores no Instagram" },
        { role: "agent", content: "Olá! Temos ótimos pacotes." }
      ],
      expectedIntent: "consulta_preco",
      expectedModules: ["instagram", "tabela_precos"]
    },
    {
      name: "Cenário 7 — Troca de assunto",
      message: "Agora quero saber sobre inscritos no YouTube",
      history: [
        { role: "customer", content: "Quero seguidores no Instagram" },
        { role: "agent", content: "Temos seguidores mundiais e brasileiros." }
      ],
      expectedPlatform: "youtube",
      expectedModules: ["youtube"]
    }
  ];

  console.log("=== INICIANDO TESTES DO MODULE SELECTOR V3 ===\n");

  for (const s of scenarios) {
    const result = selectModulesV3(s.message, s.history as any, enabledModules);
    
    console.log(`TESTE: ${s.name}`);
    console.log(`MESSAGE: "${s.message}"`);
    console.log(`CONTEXT: Intent=${result.context.intent}, Platform=${result.context.platform}, Product=${result.context.product}`);
    console.log(`SELECTED: ${result.selectedModules.join(", ")}`);
    console.log(`REASONS:`, JSON.stringify(result.selectionReasons, null, 2));
    
    // Verificações básicas
    if (s.expectedIntent && result.context.intent !== s.expectedIntent) {
      console.error(`❌ Erro: Intent esperada ${s.expectedIntent}, recebida ${result.context.intent}`);
    }
    if (s.expectedPlatform && result.context.platform !== s.expectedPlatform) {
      console.error(`❌ Erro: Plataforma esperada ${s.expectedPlatform}, recebida ${result.context.platform}`);
    }
    if (s.expectedModules) {
      for (const m of s.expectedModules) {
        if (!result.selectedModules.includes(m)) {
          console.error(`❌ Erro: Módulo ${m} deveria ter sido selecionado`);
        }
      }
    }
    if (s.notExpected) {
      for (const m of s.notExpected) {
        if (result.selectedModules.includes(m)) {
          console.error(`❌ Erro: Módulo ${m} NÃO deveria ter sido selecionado`);
        }
      }
    }
    
    console.log("-------------------------------------------\n");
  }

  console.log("=== TESTES CONCLUÍDOS ===");
}

runTests().catch(console.error);
