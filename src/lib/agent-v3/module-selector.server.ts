// src/lib/agent-v3/module-selector.server.ts
import { DEFAULT_MODULES } from "@/lib/agent-modules";

const KEYWORD_MAP: Record<string, string[]> = {
  spotify: ["spotify", "playlist", "ouvintes", "streams", "save"],
  instagram: ["instagram", "insta", "ig ", "seguidores ig", "reels", "curtidas instagram"],
  youtube: ["youtube", "yt ", "inscritos", "views youtube", "likes youtube", "horas"],
  tiktok: ["tiktok", "tik tok", "views tiktok", "seguidores tiktok"],
  kwai: ["kwai"],
  facebook: ["facebook", "face "],
  x_twitter: ["twitter", "x "],
  pagamentos: ["pix", "pagar", "pagamento", "comprovante", "valor", "preço", "quanto", "custa", "saldo", "recarga"],
  suporte: ["suporte", "ticket", "ajuda", "problema", "erro", "pedido", "status", "não chegou", "atraso"],
  teste_gratis: ["teste", "gratis", "amostra", "confiável", "golpe", "funciona"],
  como_usar_painel: ["como usar", "cadastro", "entrar", "site", "link", "painel", "conta"],
};

export function selectRelevantModules(text: string, enabledModules: string[]): string[] {
  const normalizedText = text.toLowerCase();
  const selectedKeys = new Set<string>(["identidade", "regras_gerais", "comportamento_humano"]); // Always include base modules

  // Core business logic: search for keywords
  for (const [moduleKey, keywords] of Object.entries(KEYWORD_MAP)) {
    if (enabledModules.includes(moduleKey)) {
      if (keywords.some(kw => normalizedText.includes(kw))) {
        selectedKeys.add(moduleKey);
      }
    }
  }

  // If after keyword search we still only have base modules, maybe it's a generic sales talk
  if (selectedKeys.size <= 3) {
    selectedKeys.add("fluxo_vendas");
    selectedKeys.add("tecnicas_vendas");
  }

  return Array.from(selectedKeys);
}

export function buildPromptFromModules(keys: string[], customModules: Record<string, string>): string {
  return keys
    .map(key => customModules[key] || DEFAULT_MODULES[key] || "")
    .filter(Boolean)
    .join("\n\n");
}
