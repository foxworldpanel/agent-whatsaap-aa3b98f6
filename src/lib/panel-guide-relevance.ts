// ETAPA 3 — Panel Guide sob demanda.
//
// Antes: até 30 telas (extracted_content já persistido) SEMPRE injetadas
// no prompt, mesmo em conversas de venda pura. shouldUsePanelGuide já
// existia mas só decidia se rodava a Vision — não decidia se o texto
// entrava no prompt.
//
// Agora: mesmo filtro decide também SE o extracted_content vai pro prompt.
// Olha a mensagem atual + as últimas 3 msgs do cliente pra pegar contexto
// operacional em andamento (cliente pode ter perguntado "como cadastro"
// duas msgs antes e agora só ter dito "não entendi").

const PANEL_GUIDE_RX =
  /painel|cadastr|conta|login|entrar|saldo|dep[oó]sito|pix|pedido|servi[çc]o|menu|bot[aã]o|onde clic|como fa[çc]o|como usar|clicar|adicionar fundos|nao encontr|n[aã]o acho|n[aã]o consigo|erro/i;

export function isPanelGuideRelevant(
  currentMessage: string,
  recentClientMessages: string[] = [],
): boolean {
  if (PANEL_GUIDE_RX.test(currentMessage ?? "")) return true;
  for (const m of recentClientMessages.slice(-3)) {
    if (PANEL_GUIDE_RX.test(m ?? "")) return true;
  }
  return false;
}

export { PANEL_GUIDE_RX };