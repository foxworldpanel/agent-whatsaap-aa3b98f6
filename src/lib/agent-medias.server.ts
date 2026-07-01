// Server-only helpers to pick triggered medias for the agent.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PickedMedia = {
  id: string;
  tipo: "video" | "imagem";
  url: string;
  nome: string;
  plataforma: string;
};

function norm(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function withinWindow(now: number, ini: string | null, fim: string | null): boolean {
  if (ini && new Date(ini).getTime() > now) return false;
  if (fim && new Date(fim).getTime() < now) return false;
  return true;
}

type Row = {
  id: string;
  tipo: "video" | "imagem";
  url: string;
  nome: string;
  plataforma: string;
  gatilhos: string[] | null;
  data_inicio: string | null;
  data_fim: string | null;
  ativo: boolean;
  auto_no_inicio: boolean;
};

// Tiny in-memory cache to avoid a DB hit on every incoming message.
const cache = new Map<string, { at: number; rows: Row[] }>();
const TTL_MS = 60_000;

async function loadMedias(ownerId: string): Promise<Row[]> {
  const hit = cache.get(ownerId);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return hit.rows;
  const { data } = await supabaseAdmin
    .from("agent_medias")
    .select("id,tipo,url,nome,plataforma,gatilhos,data_inicio,data_fim,ativo,auto_no_inicio")
    .eq("owner_id", ownerId)
    .eq("ativo", true);
  const rows = (data ?? []) as Row[];
  cache.set(ownerId, { at: now, rows });
  return rows;
}

export function invalidateAgentMediasCache(ownerId?: string): void {
  if (ownerId) cache.delete(ownerId);
  else cache.clear();
}

export async function pickTriggeredMedia(args: {
  ownerId: string;
  text: string;
  plataformaHint?: string | null;
  tipo: "video" | "imagem";
}): Promise<PickedMedia | null> {
  const rows = await loadMedias(args.ownerId);
  const now = Date.now();
  const text = norm(args.text);
  const plat = norm(args.plataformaHint ?? "");
  const candidates: Row[] = [];
  for (const r of rows) {
    if (r.tipo !== args.tipo) continue;
    if (!withinWindow(now, r.data_inicio, r.data_fim)) continue;
    const triggers = (r.gatilhos ?? []).map(norm).filter(Boolean);
    const hitTrigger = triggers.some((g) => text.includes(g));
    if (!hitTrigger) continue;
    candidates.push(r);
  }
  if (candidates.length === 0) return null;
  // Prioriza plataforma explícita > geral
  const preferred =
    (plat && candidates.find((c) => norm(c.plataforma) === plat)) ||
    candidates.find((c) => norm(c.plataforma) === "geral") ||
    candidates[0];
  return {
    id: preferred.id,
    tipo: preferred.tipo,
    url: preferred.url,
    nome: preferred.nome,
    plataforma: preferred.plataforma,
  };
}

export async function pickAutoPromoOnStart(args: {
  ownerId: string;
  plataformaHint?: string | null;
}): Promise<PickedMedia | null> {
  const rows = await loadMedias(args.ownerId);
  const now = Date.now();
  const plat = norm(args.plataformaHint ?? "");
  const candidates = rows.filter(
    (r) => r.tipo === "imagem" && r.auto_no_inicio && withinWindow(now, r.data_inicio, r.data_fim),
  );
  if (candidates.length === 0) return null;
  const preferred =
    (plat && candidates.find((c) => norm(c.plataforma) === plat)) ||
    candidates.find((c) => norm(c.plataforma) === "geral") ||
    candidates[0];
  return {
    id: preferred.id,
    tipo: preferred.tipo,
    url: preferred.url,
    nome: preferred.nome,
    plataforma: preferred.plataforma,
  };
}

export function detectPlatform(text: string): string | null {
  const t = norm(text);
  if (/\bspotify\b/.test(t)) return "spotify";
  if (/\byoutube\b|\byt\b/.test(t)) return "youtube";
  if (/\binstagram\b|\binsta\b|\big\b/.test(t)) return "instagram";
  if (/\btiktok\b|\btk\b/.test(t)) return "tiktok";
  if (/\bkwai\b/.test(t)) return "kwai";
  if (/\bfacebook\b|\bfb\b/.test(t)) return "facebook";
  return null;
}