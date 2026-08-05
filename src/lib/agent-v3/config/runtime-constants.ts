// Constantes arquiteturais do Module Selector — centraliza valores que
// hoje ficam espalhados como literais dentro do selector. Não contém
// nenhuma lógica, só valores. Sprint 3.6.

/**
 * Módulos que sempre carregam, independente de banco/CMS — hoje
 * hardcoded no Selector via `key === "identidade" || key === "regras_gerais"`.
 * Mover pra cá não muda o comportamento, só nomeia o valor.
 */
export const CORE_MODULES = ["identidade", "regras_gerais"] as const;

/**
 * Liga/desliga o mecanismo de fallback legado, onde um módulo cuja
 * `key` bate exatamente com a plataforma detectada (ex: key="instagram"
 * e context.platform="instagram") carrega mesmo sem nenhum selector
 * configurado. Hoje sempre true — existe como constante nomeada pra
 * facilitar desligar no futuro sem precisar mexer na lógica do Selector.
 */
export const PLATFORM_FALLBACK_ENABLED = true;
