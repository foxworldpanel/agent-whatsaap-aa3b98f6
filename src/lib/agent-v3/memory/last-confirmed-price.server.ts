// Extrai, de forma determinística (sem IA, só regex), o último preço
// que o PRÓPRIO agente mencionou na conversa — não o que o cliente
// disse. Criado em 10/08/2026 depois de achar em conversa real: o
// agente confirmou "1000 plays por 15 reais mesmo", e duas mensagens
// depois disse que esse preço "não existe", contradizendo a si mesmo.
//
// A ideia: em vez de depender do modelo "lembrar direito" relendo o
// histórico inteiro toda vez, calcula esse fato uma vez por turno, por
// código, e injeta explícito e em destaque no prompt — fato difícil de
// contradizer porque está ali, não precisa ser "lembrado".
//
// Deliberadamente simples: só pega preço junto de contexto de
// confirmação (evita capturar preço mencionado de passagem, tipo numa
// tabela inteira sendo listada). Puramente aditivo — se não achar
// nada, retorna null e não muda nenhum comportamento existente.

const CONFIRMACAO_PRECO_PATTERNS: RegExp[] = [
  // "mil plays por 15 reais mesmo" / "1000 plays + ouvintes fica R$ 15,00"
  /\b((?:\d[\d.,]*\s*)?mil|\d[\d.,]*)\s+[a-zà-ú+\s]{2,40}?\s+(?:por|fica|sai por)\s+R?\$?\s?(\d[\d.,]*)\s*(?:reais)?/i,
  // "esse de 15 reais é 1000 Plays + Ouvintes no Spotify mesmo"
  /esse\s+de\s+R?\$?\s?(\d[\d.,]*)\s*reais?\s+[ée]\s+(\d[\d.,]*\s*(?:mil)?\s+[a-zà-ú+\s]{2,40})/i,
];

export function extractLastConfirmedPriceV3(
  history: Array<{ role: "agent" | "customer"; content: string }>,
): string | null {
  // Varre de trás pra frente — quer a confirmação mais RECENTE do agente.
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const turn = history[i];
    if (turn.role !== "agent") continue;

    const text = String(turn.content || "");
    for (const pattern of CONFIRMACAO_PRECO_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        // Devolve a frase inteira que bateu, cortada, como confirmação
        // literal — mais seguro que tentar remontar campos separados.
        return match[0].trim().slice(0, 200);
      }
    }
  }
  return null;
}
