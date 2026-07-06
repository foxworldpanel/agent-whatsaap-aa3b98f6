// Server-only helpers for the Playlist Package purchase flow
// (Pacote Eclética / Eletrônica).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { smmAddOrder } from "@/lib/smm.server";

export type PacotePlaylist = "ecletica" | "eletronica";

const ELETRONICA_RE = /\b(eletr[oô]nic|electronic|house|techno|trance|deep\s*house|edm)\b/i;

export function detectPacoteFromText(text: string): PacotePlaylist | null {
  if (!text) return null;
  if (ELETRONICA_RE.test(text)) return "eletronica";
  // Default to Eclética for any explicit playlist package mention.
  if (/\b(playlist|pacote|ecl[eé]tic)\b/i.test(text)) return "ecletica";
  return null;
}

const SPOTIFY_TRACK_RE =
  /(https?:\/\/(open\.spotify\.com\/(intl-\w+\/)?track\/[a-zA-Z0-9]+|spotify\.link\/[a-zA-Z0-9]+))/i;

export function extractSpotifyTrackLink(text: string): string | null {
  if (!text) return null;
  const m = text.match(SPOTIFY_TRACK_RE);
  return m ? m[1] : null;
}

export async function getPlaylistConfig(userId: string, workspaceId: string | null) {
  const q = supabaseAdmin
    .from("agent_config")
    .select(
      "playlist_pix_key, playlist_pix_holder, playlist_price, playlist_ecletica_service_id, playlist_eletronica_service_id, playlist_ecletica_links, playlist_eletronica_links",
    )
    .eq("user_id", userId);
  const { data } = workspaceId
    ? await q.eq("workspace_id", workspaceId).maybeSingle()
    : await q.maybeSingle();
  return data ?? null;
}

export async function placePlaylistOrder(params: {
  saleId: string;
  userId: string;
  pacote: PacotePlaylist;
  musicLink: string;
}): Promise<{ ok: boolean; orderId?: string; error?: string }> {
  const { data: sale } = await supabaseAdmin
    .from("playlist_sales")
    .select("id, workspace_id, smm_order_id, status")
    .eq("id", params.saleId)
    .maybeSingle();
  if (!sale) return { ok: false, error: "venda não encontrada" };
  if (sale.smm_order_id) return { ok: true, orderId: sale.smm_order_id };

  const cfg = await getPlaylistConfig(params.userId, sale.workspace_id as string | null);
  const serviceId =
    params.pacote === "ecletica"
      ? cfg?.playlist_ecletica_service_id
      : cfg?.playlist_eletronica_service_id;
  if (!serviceId) {
    await supabaseAdmin
      .from("playlist_sales")
      .update({ status: "erro", status_message: `service_id do pacote ${params.pacote} não configurado` })
      .eq("id", params.saleId);
    return { ok: false, error: `service_id do pacote ${params.pacote} não configurado` };
  }

  const { data: integ } = await supabaseAdmin
    .from("integrations")
    .select("smm_api_key, smm_panel_url")
    .eq("user_id", params.userId)
    .maybeSingle();
  const key = integ?.smm_api_key?.trim();
  if (!key) {
    await supabaseAdmin
      .from("playlist_sales")
      .update({ status: "erro", status_message: "SMM API key ausente" })
      .eq("id", params.saleId);
    return { ok: false, error: "SMM API key ausente" };
  }

  try {
    const res = await smmAddOrder(
      { url: integ?.smm_panel_url ?? "https://mindsmmpanel.com/smmpanel/api/v1", key },
      { service: String(serviceId), link: params.musicLink, quantity: 1 },
    );
    if (res.error || !res.order) {
      await supabaseAdmin
        .from("playlist_sales")
        .update({
          status: "erro",
          status_message: res.error ?? "sem order id",
          raw_response: res.raw as never,
        })
        .eq("id", params.saleId);
      return { ok: false, error: res.error ?? "sem order id" };
    }
    await supabaseAdmin
      .from("playlist_sales")
      .update({
        status: "processando",
        smm_service_id: String(serviceId),
        smm_order_id: String(res.order),
        music_link: params.musicLink,
        raw_response: res.raw as never,
      })
      .eq("id", params.saleId);
    return { ok: true, orderId: String(res.order) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseAdmin
      .from("playlist_sales")
      .update({ status: "erro", status_message: msg })
      .eq("id", params.saleId);
    return { ok: false, error: msg };
  }
}