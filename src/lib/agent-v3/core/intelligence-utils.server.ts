import { isPureGreeting, pickReengagementGreeting } from "../brain/guards.server";
import { PURE_INTEREST_PHRASES, PLATFORM_ISOLATED_MAP } from "./router-constants";
import { removeAccents } from "../../text-normalize";

/**
 * UTILS PARA DERIVAÇÃO DE TEMPERATURA E PROBABILIDADE
 * Extraídos do Orchestrator para evitar duplicação e permitir uso pelo Smart Router.
 */

export function deriveTemperatureFromProbability(prob: number, criticalComplaint?: boolean): "frio" | "morno" | "quente" {
  if (criticalComplaint) return "frio";
  if (prob >= 75) return "quente";
  if (prob >= 40) return "morno";
  return "frio";
}

export function calculateBasePurchaseProbability(params: {
  intent: string;
  hasGrowthGoal?: boolean;
  platform?: string | null;
  product?: string | null;
  hasQuantity?: boolean;
  hasPaidSignal?: boolean;
  hasPaymentSignal?: boolean;
}) {
  let prob = 20;
  if (params.intent === "consulta_preco") prob = 50;
  if (params.hasGrowthGoal) prob = Math.max(prob, 45);
  if (params.intent === "descoberta" && params.platform && params.product) prob = Math.max(prob, 45);
  if (params.intent === "compra") prob = params.hasQuantity ? 80 : 70;
  if (params.intent === "pagamento") prob = 90;
  if (params.hasPaidSignal) prob = 95;
  if (params.intent === "suporte" || params.intent === "pos_compra") prob = 25;

  if (params.platform && params.product && params.hasQuantity && params.intent !== "suporte" && params.intent !== "pos_compra") {
    prob = Math.max(prob, 78);
  }
  if (params.hasPaymentSignal && params.intent !== "suporte") prob = Math.max(prob, 90);
  
  return prob;
}

export function applyBusinessDecisionToIntelligence(params: {
  state: string;
  currentProb: number;
  repurchasePotential?: string | null;
}) {
  let prob = params.currentProb;
  let temperature: "frio" | "morno" | "quente" = "frio";

  switch (params.state) {
    case "orcamento":
      prob = Math.max(prob, 50);
      temperature = prob >= 75 ? "quente" : "morno";
      break;
    case "fechamento":
      prob = Math.max(prob, 85);
      temperature = "quente";
      break;
    case "pagamento":
      prob = Math.max(prob, 90);
      temperature = "quente";
      break;
    case "compra_bloqueada":
      prob = Math.max(prob, 90);
      temperature = "quente";
      break;
    case "pedido_realizado":
      prob = 100;
      temperature = "quente";
      break;
    case "pos_venda":
      prob = Math.max(
        prob,
        params.repurchasePotential === "alto" ? 90 : params.repurchasePotential === "medio" ? 70 : 55,
      );
      temperature = prob >= 75 ? "quente" : "morno";
      break;
    case "reclamacao":
      prob = Math.min(prob, 20);
      temperature = "frio";
      break;
    case "abandono":
      prob = Math.min(prob, 35);
      temperature = "frio";
      break;
    default:
      temperature = deriveTemperatureFromProbability(prob);
      break;
  }

  return { purchase_probability: prob, temperature };
}
