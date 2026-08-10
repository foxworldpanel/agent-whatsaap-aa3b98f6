// Loader runtime (usa supabaseAdmin) do catálogo REAL de playlists por
// pacote (Eclética / Eletrônica) do workspace. Usado pelo prompt da
// Júlia pra listar diretamente ao cliente as playlists cadastradas —
// evita a regressão de 08/07 em que a Júlia inventava "abre um ticket
// no Suporte pra saber as playlists". Cache curto em memória (mesma
// strategy).

type CacheEntry = {
  value: { ecletica: string[]; eletronica: string[] };
  expiresAt: number;
};
const cache = new Map<string, CacheEntry>();
const TTL_MS = 30_000;

const EMPTY = { ecletica: [] as string[], eletronica: [] as string[] };

export async function loadPlaylistCatalog(
  userId: string | null | undefined,
): Promise<{ ecletica: string[]; eletronica: string[] }> {
  if (!userId) return EMPTY;
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > now) return cached.value;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("agent_config")
      .select("playlist_ecletica_links, playlist_eletronica_links")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const row = (data ?? null) as {
      playlist_ecletica_links: string[] | null;
      playlist_eletronica_links: string[] | null;
    } | null;
    const value = {
      ecletica: (row?.playlist_ecletica_links ?? []).filter(
        (s) => typeof s === "string" && s.trim().length > 0,
      ),
      eletronica: (row?.playlist_eletronica_links ?? []).filter(
        (s) => typeof s === "string" && s.trim().length > 0,
      ),
    };
    cache.set(userId, { value, expiresAt: now + TTL_MS });
    return value;
  } catch (err) {
    console.warn(
      "[playlist-catalog] falling back to empty catalog:",
      err instanceof Error ? err.message : err,
    );
    return EMPTY;
  }
}

export function invalidatePlaylistCatalogCache(userId: string) {
  cache.delete(userId);
}