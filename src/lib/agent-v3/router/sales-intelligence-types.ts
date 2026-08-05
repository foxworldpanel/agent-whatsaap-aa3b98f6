// Sales Intelligence — scaffolding de tipos para decisões de venda
// futuras. NADA aqui é usado pelo Router, Selector ou Orchestrator
// ainda — são só definições de tipo, preparando o terreno pro
// próximo ciclo de trabalho (fora do escopo deste pacote, que é só
// "arrumar o motor").
//
// Quando essas estratégias forem implementadas de verdade, o
// SmartRouterDecisionContext (smart-router.server.ts) é o lugar
// natural pra carregar um campo `salesSignal?: SalesSignal`.

export type LeadTemperature = "hot" | "warm" | "cold";

export type SalesStage =
  | "objection"
  | "closing"
  | "free_trial"
  | "discovery"
  | "undecided";

export type SalesSignal = {
  leadTemperature?: LeadTemperature;
  stage?: SalesStage;
  // Motivo textual da classificação, pra auditoria/log — igual ao
  // padrão já usado em routeReason no Smart Router.
  reason?: string;
};
