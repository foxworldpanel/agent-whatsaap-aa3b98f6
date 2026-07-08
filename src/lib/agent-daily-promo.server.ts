// Loader runtime (usa supabaseAdmin) da promoção do dia. Retorna o texto
// ativo apenas quando: (a) `active = true` E (b) `expires_at` é null OU
// futura. Fora disso, retorna null e o prompt NÃO recebe bloco algum.
// Espelha o padrão de agent_config: escopo por user_id (workspace único
// por instância). Cache curto em memória pra evitar hit por request.
type CacheEntry = { value: string | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 30_000;

export function computeActivePromo(
  row: {
    promo_text: string | null;
    active: boolean | null;
    expires_at: string | null;
  } | null,
  now: Date = new Date(),
): string | null {
  if (!row) return null;
  if (!row.active) return null;
  const text = (row.promo_text ?? "").trim();
  if (text.length === 0) return null;
  if (row.expires_at) {
    const exp = new Date(row.expires_at);
    if (!isNaN(exp.getTime()) && exp.getTime() <= now.getTime()) return null;
  }
  return text;
}

export function buildDailyPromoBlock(text: string | null | undefined): string {
  if (!text || text.trim().length === 0) return "";
  return `🔥 PROMOÇÃO ATIVA HOJE:
${text.trim()}

Quando fizer sentido na conversa (cliente perguntando do serviço/rede correspondente, ou perguntando se tem promoção/desconto), mencione essa promoção específica de forma natural. NUNCA invente outra promoção, desconto ou condição além desta. Se esta promoção não estiver no bloco (bloco ausente do prompt), NUNCA mencione nenhuma promoção — mantém a regra normal de "nunca dar desconto manual".`;
}

export async function loadActiveDailyPromo(
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null;
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > now) return cached.value;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => {
            order: (
              c: string,
              o: { ascending: boolean },
            ) => {
              limit: (n: number) => {
                maybeSingle: () => Promise<{
                  data: unknown;
                  error: { message: string } | null;
                }>;
              };
            };
          };
        };
      };
    };
    const { data, error } = await db
      .from("agent_daily_promo")
      .select("promo_text, active, expires_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const active = computeActivePromo(data as never);
    cache.set(userId, { value: active, expiresAt: now + TTL_MS });
    return active;
  } catch (err) {
    console.warn(
      "[agent-daily-promo] falling back to null:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export function invalidateDailyPromoCache(userId: string) {
  cache.delete(userId);
}
