// Fonte única de identidade do agente.
// Sprint 1: Persona delegada exclusivamente ao CMS via agent_modules_v3.

export type AgentIdentityFields = {
  agentId?: string;
  workspaceId?: string;
  model?: string;
  provider?: string;
  persona?: string;
  regra_emoji?: string;
  regra_split?: string;
  terminologia_redes?: string;
  regra_teste_gratis?: string;
  regra_anti_invencao?: string;
  exemplo_disparo?: string;
  reconhecimento_interesse?: string;
  regra_encerramento?: string;
  regra_estilo_escrita?: string;
};

export const IDENTITY_FIELDS: Array<keyof AgentIdentityFields> = [
  "persona",
  "regra_emoji",
  "regra_split",
  "terminologia_redes",
  "regra_teste_gratis",
  "regra_anti_invencao",
  "exemplo_disparo",
  "reconhecimento_interesse",
  "regra_encerramento",
  "regra_estilo_escrita",
];

export const IDENTITY_LABELS: Partial<Record<keyof AgentIdentityFields, string>> = {
  persona: "1. Persona",
  regra_emoji: "2. Regra de emoji",
  regra_split: "3. Regra de split de mensagem",
  terminologia_redes: "4. Terminologia por rede",
  regra_teste_gratis: "5. Regra de teste grátis (risco financeiro)",
  regra_anti_invencao: "6. Regra anti-invenção",
  exemplo_disparo: "7. Exemplo modelo de disparo",
  reconhecimento_interesse: "8. Reconhecimento de interesse",
  regra_encerramento: "9. Regra de encerramento por recusa",
  regra_estilo_escrita: "10. Estilo de escrita (soar humano)",
};

export const DEFAULT_IDENTITY: AgentIdentityFields = {
  model: "claude-haiku-4-5",
  provider: "anthropic",
  persona: "",
  regra_emoji: "",
  regra_split: "",
  terminologia_redes: "",
  regra_teste_gratis: "",
  regra_anti_invencao: "",
  exemplo_disparo: "",
  reconhecimento_interesse: "",
  regra_encerramento: "",
  regra_estilo_escrita: "",
};

export function mergeIdentity(
  partial: Partial<AgentIdentityFields> | null | undefined,
): AgentIdentityFields {
  const out = { ...DEFAULT_IDENTITY };
  if (!partial) return out;
  for (const key of IDENTITY_FIELDS) {
    const v = (partial as any)[key];
    if (typeof v === "string" && v.trim().length > 0) (out as any)[key] = v;
  }
  return out;
}

// Cache curto (30s) por user_id — evita hit no DB em cada request.
type CacheEntry = { value: AgentIdentityFields; expiresAt: number };
const identityCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

export async function loadAgentIdentity(userId: string | null | undefined): Promise<AgentIdentityFields> {
  if (!userId) return { ...DEFAULT_IDENTITY };
  const now = Date.now();
  const cached = identityCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.value;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("agent_identity")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    const merged = mergeIdentity(data as any);
    identityCache.set(userId, { value: merged, expiresAt: now + CACHE_TTL_MS });
    return merged;
  } catch (err) {
    return { ...DEFAULT_IDENTITY };
  }
}

export function invalidateAgentIdentityCache(userId: string) {
  identityCache.delete(userId);
}

export type AgentBrandBlocks = {
  respostas_padrao?: string;
  regra_mq_hq?: string;
  regra_autoridade?: string;
};

export const BRAND_BLOCK_KEYS: Array<keyof AgentBrandBlocks> = [
  "respostas_padrao",
  "regra_mq_hq",
  "regra_autoridade",
];

export const MIND_BRAND_TEMPLATE = {
  persona: "",
  terminologia_redes: "",
  exemplo_disparo: "",
};

export const MIND_BRAND_BLOCKS: AgentBrandBlocks = {
  respostas_padrao: "",
  regra_mq_hq: "",
  regra_autoridade: "",
};

export async function loadBrandBlocks(userId: string | null | undefined): Promise<AgentBrandBlocks> {
  return {};
}

export function invalidateBrandBlocksCache(userId: string) {}

export function buildSharedRules(identity: AgentIdentityFields, ctx: any = {}): string {
  // Retorna vazio para a V3, pois a V3 usa módulos do CMS para regras.
  return "";
}

export function buildRegraPlaylistsInfoDiretaBlock(catalog: any): string {
  return "";
}
