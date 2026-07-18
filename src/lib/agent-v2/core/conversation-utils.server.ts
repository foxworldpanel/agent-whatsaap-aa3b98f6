/**
 * Utilitários compartilhados de conversação (Camada Neutra).
 * Desacoplado da arquitetura V1 para servir à Runtime V2 e outros serviços.
 */

export type Msg = { sender: "agente" | "cliente"; body: string; created_at?: string | null };

/**
 * Obtém a última mensagem enviada pelo cliente no histórico.
 */
export function getLatestClientMessage(history: Msg[]): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const msg = history[i];
    if (msg.sender === "cliente" && msg.body?.trim()) return msg.body.trim();
  }
  return "";
}

/**
 * Detecta se a conversa está em contexto de suporte ou pós-venda.
 */
export function isSupportOrPostSaleContext(history: Msg[]): boolean {
  const agentMsgs = history.filter((m) => m.sender === "agente" && m.body?.trim());
  if (agentMsgs.length === 0) return false;
  
  const supportRx =
    /(qual\s+rede|qual\s+servi[cç]o|qual\s+plataforma|quer\s+impulsionar|status|pedido|painel|saldo|ticket|processando|pendente|entregue|order\s*id|comprovante|pagamento|pix)/i;
  
  for (const m of agentMsgs) {
    if (supportRx.test(m.body)) return true;
  }
  return false;
}

/**
 * Escolhe a saudação retributiva adequada para reengajamento.
 */
export function pickReengagementGreeting(
  latestClientMsg: string,
  nowDate: Date = new Date(),
): string {
  const s = (latestClientMsg ?? "").toLowerCase();
  if (/\bbom\s*dia\b/.test(s)) return "Bom dia";
  if (/\bboa\s*tarde\b/.test(s)) return "Boa tarde";
  if (/\bboa\s*noite\b/.test(s)) return "Boa noite";

  // Fallback pelo horário (BR/UTC-3 aproximado)
  const hour = nowDate.getHours();
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Normaliza pontuação para soar mais humano (removendo traços típicos de LLM).
 */
export function humanizePunctuation(text: string): string {
  if (!text) return text;
  return text
    .replace(/ — /g, ", ")
    .replace(/ – /g, ", ")
    .replace(/ - /g, ", ");
}
