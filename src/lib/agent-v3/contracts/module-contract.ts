// Contratos do CMS — camada de tipos e validação da arquitetura definida
// na auditoria (docs/architecture/01 a 08). NÃO é usado pelo runtime
// ainda — essa integração é escopo de sprint futura (3.2 em diante).
// Este arquivo só declara os tipos e valida contra eles.

export type Domain = "CORE" | "GLOBAL" | "SALES" | "PLATFORMS" | "ADMIN";

export type Platform =
  | "spotify"
  | "youtube"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "kwai"
  | "x"
  | null;

export type KnowledgeType =
  | "base"
  | "education"
  | "catalog"
  | "pricing"
  | "promotion"
  | "delivery"
  | "links"
  | "support"
  | "policy"
  | "flow"
  | "exception";

export type ModuleStatus = "active" | "legacy" | "migrate" | "review";

/**
 * Contrato oficial de módulo — reflete a arquitetura documentada em
 * 03-module-contract.md. Campos `domain`/`platform`/`knowledgeType`/
 * `status` são NOVOS (não existem hoje na tabela agent_modules_v3,
 * conforme 06-module-classification.md); os demais já existem no
 * schema real, mapeados aqui só como referência de tipo.
 */
export interface ModuleContract {
  id: string;
  name: string;
  domain: Domain;
  platform: Platform;
  knowledgeType: KnowledgeType;
  status: ModuleStatus;
  priority: number;
  routing: {
    intents: string[];
    stages: string[];
    platforms: string[];
    products: string[];
    triggers: string[];
    alwaysLoad: boolean;
    dependencies: string[];
    conflicts: string[];
  };
}

const VALID_DOMAINS: readonly Domain[] = ["CORE", "GLOBAL", "SALES", "PLATFORMS", "ADMIN"];

const VALID_PLATFORMS: readonly Platform[] = [
  "spotify",
  "youtube",
  "instagram",
  "facebook",
  "tiktok",
  "kwai",
  "x",
  null,
];

const VALID_KNOWLEDGE_TYPES: readonly KnowledgeType[] = [
  "base",
  "education",
  "catalog",
  "pricing",
  "promotion",
  "delivery",
  "links",
  "support",
  "policy",
  "flow",
  "exception",
];

const VALID_STATUSES: readonly ModuleStatus[] = ["active", "legacy", "migrate", "review"];

export function isValidDomain(value: unknown): value is Domain {
  return VALID_DOMAINS.includes(value as Domain);
}

export function isValidPlatform(value: unknown): value is Platform {
  return VALID_PLATFORMS.includes(value as Platform);
}

export function isValidKnowledgeType(value: unknown): value is KnowledgeType {
  return VALID_KNOWLEDGE_TYPES.includes(value as KnowledgeType);
}

export function isValidModuleStatus(value: unknown): value is ModuleStatus {
  return VALID_STATUSES.includes(value as ModuleStatus);
}

export type ModuleContractValidationResult = {
  valid: boolean;
  errors: string[];
};

/**
 * Valida um objeto candidato contra o contrato completo. Não lança
 * exceção — retorna a lista de erros encontrados, pra quem chamar
 * decidir o que fazer (hoje, ninguém chama isso ainda).
 */
export function validateModuleContract(candidate: {
  domain?: unknown;
  platform?: unknown;
  knowledgeType?: unknown;
  status?: unknown;
}): ModuleContractValidationResult {
  const errors: string[] = [];

  if (!isValidDomain(candidate.domain)) {
    errors.push(`domain inválido: ${JSON.stringify(candidate.domain)}. Esperado um de: ${VALID_DOMAINS.join(", ")}`);
  }
  if (!isValidPlatform(candidate.platform)) {
    errors.push(`platform inválido: ${JSON.stringify(candidate.platform)}. Esperado um de: ${VALID_PLATFORMS.join(", ")}`);
  }
  if (!isValidKnowledgeType(candidate.knowledgeType)) {
    errors.push(`knowledgeType inválido: ${JSON.stringify(candidate.knowledgeType)}. Esperado um de: ${VALID_KNOWLEDGE_TYPES.join(", ")}`);
  }
  if (!isValidModuleStatus(candidate.status)) {
    errors.push(`status inválido: ${JSON.stringify(candidate.status)}. Esperado um de: ${VALID_STATUSES.join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}

export type ModuleContractSoftValidationResult = {
  classified: boolean; // true se PELO MENOS 1 dos 4 campos novos está presente
  valid: boolean; // só é avaliado se classified=true
  errors: string[];
};

/**
 * Validação "suave" — pensada pro estado ATUAL do banco, onde nenhum
 * módulo tem domain/platform/knowledgeType/status preenchido ainda
 * (confirmado na Sprint 2A.2). Ausência dos 4 campos NÃO é erro, é
 * "ainda não classificado". Só reporta erro se um campo estiver
 * presente com valor fora da taxonomia oficial.
 */
export function validateModuleContractSoft(candidate: {
  domain?: unknown;
  platform?: unknown;
  knowledgeType?: unknown;
  status?: unknown;
}): ModuleContractSoftValidationResult {
  const hasAnyField =
    candidate.domain !== undefined ||
    candidate.platform !== undefined ||
    candidate.knowledgeType !== undefined ||
    candidate.status !== undefined;

  if (!hasAnyField) {
    return { classified: false, valid: true, errors: [] };
  }

  const errors: string[] = [];
  if (candidate.domain !== undefined && !isValidDomain(candidate.domain)) {
    errors.push(`domain inválido: ${JSON.stringify(candidate.domain)}`);
  }
  if (candidate.platform !== undefined && !isValidPlatform(candidate.platform)) {
    errors.push(`platform inválido: ${JSON.stringify(candidate.platform)}`);
  }
  if (candidate.knowledgeType !== undefined && !isValidKnowledgeType(candidate.knowledgeType)) {
    errors.push(`knowledgeType inválido: ${JSON.stringify(candidate.knowledgeType)}`);
  }
  if (candidate.status !== undefined && !isValidModuleStatus(candidate.status)) {
    errors.push(`status inválido: ${JSON.stringify(candidate.status)}`);
  }

  return { classified: true, valid: errors.length === 0, errors };
}
