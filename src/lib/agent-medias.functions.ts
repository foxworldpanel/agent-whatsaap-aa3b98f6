import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";

export type AgentMediaTipo = "video" | "imagem";
export type AgentMedia = {
  id: string;
  owner_id: string;
  tipo: AgentMediaTipo;
  nome: string;
  url: string;
  storage_path: string | null;
  plataforma: string;
  gatilhos: string[];
  data_inicio: string | null;
  data_fim: string | null;
  ativo: boolean;
  auto_no_inicio: boolean;
  created_at: string;
  updated_at: string;
};

export type AgentMediaInput = {
  id?: string;
  tipo: AgentMediaTipo;
  nome: string;
  url: string;
  storage_path?: string | null;
  plataforma: string;
  gatilhos: string[];
  data_inicio?: string | null;
  data_fim?: string | null;
  ativo?: boolean;
  auto_no_inicio?: boolean;
};

function validateVideoUrl(url: string): void {
  const u = url.trim().toLowerCase();
  const ok =
    u.includes("youtube.com/watch") ||
    u.includes("youtu.be/") ||
    u.includes("drive.google.com/") ||
    u.endsWith(".mp4") ||
    u.startsWith("data:video/") ||
    /supabase\.co\/storage\//.test(u);
  if (!ok) throw new Error("URL de vídeo inválida (use YouTube, Google Drive ou .mp4).");
}

export const listAgentMedias = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: { tipo?: AgentMediaTipo } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    const q = context.supabase.from("agent_medias").select("*").order("created_at", { ascending: false });
    if (data.tipo) q.eq("tipo", data.tipo);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as AgentMedia[];
  });

export const upsertAgentMedia = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: AgentMediaInput) => {
    if (!d.nome?.trim()) throw new Error("Nome é obrigatório.");
    if (!d.url?.trim()) throw new Error("URL/arquivo é obrigatório.");
    if (d.tipo === "video") validateVideoUrl(d.url);
    if (d.data_inicio && d.data_fim && new Date(d.data_inicio) > new Date(d.data_fim)) {
      throw new Error("Data de início deve ser anterior à data de fim.");
    }
    return d;
  })
  .handler(async ({ data, context }) => {
    const payload = {
      owner_id: context.userId,
      tipo: data.tipo,
      nome: data.nome.trim(),
      url: data.url.trim(),
      storage_path: data.storage_path ?? null,
      plataforma: (data.plataforma || "geral").toLowerCase(),
      gatilhos: (data.gatilhos ?? []).map((g) => g.trim()).filter(Boolean),
      data_inicio: data.data_inicio || null,
      data_fim: data.data_fim || null,
      ativo: data.ativo ?? true,
      auto_no_inicio: data.auto_no_inicio ?? false,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("agent_medias").update(payload).eq("id", data.id).eq("owner_id", context.userId).select("*").single();
      if (error) throw new Error(error.message);
      return row as AgentMedia;
    }
    const { data: row, error } = await context.supabase
      .from("agent_medias").insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    return row as AgentMedia;
  });

export const deleteAgentMedia = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("agent_medias").select("storage_path").eq("id", data.id).eq("owner_id", context.userId).maybeSingle();
    if (existing?.storage_path) {
      await context.supabase.storage.from("agent-medias").remove([existing.storage_path]).catch(() => {});
    }
    const { error } = await context.supabase.from("agent_medias").delete().eq("id", data.id).eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleAgentMedia = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: { id: string; ativo: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agent_medias").update({ ativo: data.ativo }).eq("id", data.id).eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });