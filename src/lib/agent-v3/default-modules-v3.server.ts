/**
 * Módulos Padrão do Sistema (Fallbacks)
 * Estes módulos são carregados apenas como fallback técnico mínimo.
 * A inteligência real (Persona, Vendas, Redes) DEVE vir do banco agent_modules_v3.
 */
export const DEFAULT_MODULES_V3: Record<string, string> = {
  identidade: "Fallback técnico: Carregando identidade do agente...",
  regras_gerais: "Fallback técnico: Carregando regras gerais...",
  comportamento_humano: "Fallback técnico: Carregando instruções de comportamento...",
  spotify: "Fallback técnico: Carregando serviços Spotify...",
  instagram: "Fallback técnico: Carregando serviços Instagram...",
  youtube: "Fallback técnico: Carregando serviços YouTube...",
  psicologia_vendas: "Fallback técnico: Carregando estratégias de vendas...",
  fechamento_vendas: "Fallback técnico: Carregando fluxo de fechamento...",
  suporte: "Fallback técnico: Carregando instruções de suporte..."
};
