// Constantes do Smart Router — frases e mapeamentos usados pelas rotas
// determinísticas. Centralizados aqui pra adicionar uma frase nova
// (ex: "quero divulgar", "preciso de seguidores") sem precisar mexer
// no algoritmo do routeMessage().

/**
 * Frases curtas e exatas de interesse inicial. O Router exige que a
 * mensagem normalizada seja SUBSTANCIALMENTE uma dessas frases (não
 * "contains") — ver isPureInitialInterest() em smart-router.server.ts.
 */
export const PURE_INTEREST_PHRASES = new Set([
  "tenho interesse",
  "quero conhecer",
  "quero saber",
  "gostaria de saber",
  "quero comprar",
  "quero informacoes",
  "quero informações",
]);

/**
 * Plataformas reconhecidas quando a mensagem é SÓ o nome da rede,
 * isolado (sem outras palavras). Mapeia variação/apelido → nome
 * canônico.
 *
 * Nota de sincronia: esta lista é mantida manualmente em paralelo à
 * PLATFORM_PATTERNS do Module Selector (module-selector.server.ts).
 * As duas cumprem papéis diferentes hoje (Router só reconhece/loga sem
 * decidir módulo; Selector decide carregamento) e por isso não foram
 * unificadas nesta sprint — mas se divergirem no futuro (uma reconhece
 * uma plataforma que a outra não), isso pode gerar inconsistência.
 * Registrado como item de backlog: migrar as duas pra consumir uma
 * única fonte de verdade compartilhada.
 */
export const PLATFORM_ISOLATED_MAP: Record<string, string> = {
  spotify: "spotify",
  instagram: "instagram",
  insta: "instagram",
  youtube: "youtube",
  yt: "youtube",
  tiktok: "tiktok",
  "tik tok": "tiktok",
  facebook: "facebook",
  face: "facebook",
  kwai: "kwai",
  x: "x",
  twitter: "x",
};
