// Module Contract Reporter — componente independente, responsável
// exclusivamente por validar módulos contra o contrato oficial e gerar
// diagnóstico. NÃO decide seleção, NÃO participa do Module Selector.
//
// Fluxo: Module Selector → resultado da seleção → Reporter → log.
// O Selector nunca importa nem conhece este arquivo.

import type { LoadedModuleV3 } from "../brain/modules.server";
import { validateModuleContractSoft } from "./module-contract";

// Flag de ambiente — desliga o relatório sem precisar mudar código.
// Fica ligado por padrão fora de produção; em produção, liga só se a
// env var for setada explicitamente (custo é baixo hoje, mas a base já
// fica pronta pra quando o volume de módulos/contratos crescer).
const CONTRACT_REPORTING_ENABLED =
  (typeof process !== "undefined" && process.env.NODE_ENV !== "production") ||
  (typeof process !== "undefined" && process.env.ENABLE_CONTRACT_REPORTING === "true");

export type ContractReportSummary = {
  total: number;
  classified: number;
  invalid: number;
  invalidDetails: string[];
};

/**
 * Avalia um conjunto de módulos (tipicamente: todos os candidatos
 * avaliados pelo Module Selector num turno) contra o contrato oficial.
 * Puramente informativo — nunca lança exceção, nunca bloqueia nada.
 */
export function buildContractReport(
  modules: Record<string, LoadedModuleV3>,
): ContractReportSummary {
  const summary: ContractReportSummary = {
    total: 0,
    classified: 0,
    invalid: 0,
    invalidDetails: [],
  };

  for (const [key, module] of Object.entries(modules)) {
    summary.total += 1;
    const check = validateModuleContractSoft(module as any);
    if (check.classified) {
      summary.classified += 1;
      if (!check.valid) {
        summary.invalid += 1;
        summary.invalidDetails.push(`${key}: ${check.errors.join("; ")}`);
      }
    }
  }

  return summary;
}

/**
 * Loga o relatório de contrato, respeitando a flag de ambiente. Chamado
 * pelo orchestrator (ou qualquer outro chamador), nunca pelo Selector.
 */
export function logContractReport(modules: Record<string, LoadedModuleV3>, runId?: string): void {
  if (!CONTRACT_REPORTING_ENABLED) return;

  try {
    const summary = buildContractReport(modules);
    const lines = [
      "=== CONTRACT REPORT (Sprint 3.2.1 — componente independente) ===",
      ...(runId ? [`RUN ID: ${runId}`] : []),
      `Módulos avaliados: ${summary.total} | Classificados: ${summary.classified} | Inválidos: ${summary.invalid}`,
      ...(summary.invalidDetails.length > 0 ? [`Detalhes: ${summary.invalidDetails.join(" | ")}`] : []),
      "===============================",
    ];
    console.log(lines.join("\n"));
  } catch (e) {
    // Falha no relatório nunca deve afetar o fluxo principal.
    console.warn("[CONTRACT-REPORT] Falha ao gerar relatório (não bloqueia o fluxo):", e);
  }
}
