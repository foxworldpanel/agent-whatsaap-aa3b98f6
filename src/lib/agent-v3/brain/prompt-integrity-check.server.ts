// Verificador de integridade do prompt — detecta se uma regra crítica
// sumiu silenciosamente (edição externa, merge mal feito, etc).
//
// Motivo de existir: aconteceu 3 vezes na mesma sessão de correções —
// P1/P2 foram reescritos por fora, e numa dessas vezes um bloco inteiro
// (regra de formatação de tabela de preço) desapareceu sem deixar
// rastro. Sem essa checagem, isso só seria descoberto quando desse
// errado numa conversa real com cliente.
//
// Não bloqueia o fluxo se algo estiver faltando — só avisa alto no log,
// pra alguém notar e investigar. Roda a cada turno (custo desprezível,
// são só checagens de substring em texto já carregado).

import { P0_TEXT } from "../prompt/prompt-p0.server";
import { buildP1Text } from "../prompt/prompt-p1.server";
import { buildP2Text } from "../prompt/prompt-p2.server";
import { MIND_OPERATIONAL_TRUTH_V3 } from "./operational-truth.server";

// Cada marcador é um trecho EXATO que precisa existir em algum lugar do
// bloco correspondente. Lista enxuta de propósito — só regras com risco
// financeiro/reputacional real, não every single line do prompt (isso
// tornaria a lista impossível de manter).
const CRITICAL_MARKERS: Array<{ block: string; marker: string; text: string }> = [
  { block: "P0", marker: "royalties, renda ou faturamento diretamente", text: P0_TEXT },
  { block: "P0", marker: "NUNCA invente estratégia de", text: P0_TEXT },
  { block: "P0", marker: "As ÚNICAS plataformas reais da Mind são", text: P0_TEXT },
  { block: "P0", marker: "sem lista com traço ou marcador", text: P0_TEXT },
  { block: "P1", marker: "Pergunte SOMENTE o que ainda falta", text: buildP1Text({ mentionsOwnMusic: false }) },
  { block: "P2", marker: "ZERO emoji, sem exceção", text: buildP2Text({ isAudioInput: false, isImageInput: false, isStickerInput: false }) },
  { block: "P2", marker: "PROIBIDO usar \"qualquer dúvida é só chamar\"", text: buildP2Text({ isAudioInput: false, isImageInput: false, isStickerInput: false }) },
  { block: "P2", marker: "NUNCA prometa enviar áudio", text: buildP2Text({ isAudioInput: false, isImageInput: false, isStickerInput: false }) },
  { block: "P2", marker: "1 serviço por linha, nunca corte um item", text: buildP2Text({ isAudioInput: false, isImageInput: false, isStickerInput: false }) },
  { block: "OPERATIONAL_TRUTH", marker: "RECLAMAÇÃO DE ENTREGA", text: MIND_OPERATIONAL_TRUTH_V3 },
];

let alreadyWarnedThisProcess = false;

/**
 * Verifica se todas as regras críticas ainda existem no texto atual dos
 * blocos de prompt. Chamado a cada turno — se algo sumiu, avisa alto
 * no log uma vez por processo (evita spam) e continua o fluxo normal.
 */
export function checkPromptIntegrity(): void {
  const missing = CRITICAL_MARKERS.filter((m) => !m.text.includes(m.marker));
  if (missing.length === 0) return;

  if (!alreadyWarnedThisProcess) {
    console.error(
      "[PROMPT-INTEGRITY] ⚠️ REGRA CRÍTICA SUMIU DO PROMPT — investigar antes que afete cliente real:",
      missing.map((m) => `${m.block}: "${m.marker}"`),
    );
    alreadyWarnedThisProcess = true;
  }
}
