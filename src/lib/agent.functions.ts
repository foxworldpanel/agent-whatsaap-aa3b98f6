import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";


import { z } from "zod";
import { getSharedUazapiUserIds } from "@/lib/agent-shared.server";


type PanelShot = { url: string; path?: string; label?: string };

function extractPanelGuideStoragePath(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const markers = [
      "/storage/v1/object/sign/panel-guide/",
      "/storage/v1/object/public/panel-guide/",
      "/storage/v1/object/authenticated/panel-guide/",
    ];
    for (const marker of markers) {
      const idx = parsed.pathname.indexOf(marker);
      if (idx >= 0) return decodeURIComponent(parsed.pathname.slice(idx + marker.length));
    }
  } catch {
    return null;
  }
  return null;
}

export const getAgentConfig = createServerFn({ method: "GET" })

  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agent_config")
      .select("*")
      .eq("user_id", context.userId)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return data;

    // URLs assinadas do Storage expiram; mantemos o path permanente no banco
    // e geramos uma URL fresca sempre que a tela do agente abre.
    const refreshSignedUrls = async (items: unknown): Promise<PanelShot[]> => {
      if (!Array.isArray(items)) return [];
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return Promise.all(
        items.map(async (item) => {
          const shot = item as { url?: string; path?: string; label?: string };
          const path = shot.path ?? extractPanelGuideStoragePath(shot.url);
          if (!path) return { url: shot.url ?? "", label: shot.label };
          const { data: signed } = await supabaseAdmin.storage
            .from("panel-guide")
            .createSignedUrl(path, 60 * 60 * 24 * 7);
          return { url: signed?.signedUrl ?? shot.url ?? "", path, label: shot.label };
        }),
      );
    };

    return {
      ...data,
      panel_screenshots_mobile: await refreshSignedUrls((data as { panel_screenshots_mobile?: unknown }).panel_screenshots_mobile),
      panel_screenshots_desktop: await refreshSignedUrls((data as { panel_screenshots_desktop?: unknown }).panel_screenshots_desktop),
    };
  });

const listAgentLogsSchema = z.object({
  type: z.string().max(100).optional(),
  phone: z.string().max(40).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  onlyErrors: z.boolean().optional(),
});

export const listAgentLogs = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => listAgentLogsSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const userIds = await getSharedUazapiUserIds(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("agent_logs")
      .select("id, phone, conversation_id, type, level, summary, prompt, response, error, duration_ms, metadata, created_at")
      .in("user_id", userIds)
      .eq("workspace_id", context.workspaceId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (data.onlyErrors) query = query.eq("level", "error");
    if (data.type) query = query.eq("type", data.type);
    if (data.phone?.trim()) query = query.ilike("phone", `%${data.phone.trim()}%`);
    if (data.date) {
      const start = new Date(`${data.date}T00:00:00`).toISOString();
      const end = new Date(`${data.date}T23:59:59.999`).toISOString();
      query = query.gte("created_at", start).lte("created_at", end);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveAgentConfig = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      agent_name: z.string().min(1).max(80),
      tone: z.string().min(1).max(120),
      base_instruction: z.string().min(1).max(20000),
      script_frio: z.string().min(1).max(2000),
      script_inativo: z.string().min(1).max(2000),
      script_ativo: z.string().min(1).max(2000),
      panel_link: z.string().max(500).optional().nullable(),
      main_offer: z.string().min(1).max(200),
      audio_enabled: z.boolean(),
      agent_enabled: z.boolean().optional(),
      response_delay_min_sec: z.number().int().min(0).max(600).optional(),
      response_delay_max_sec: z.number().int().min(0).max(600).optional(),
      typing_indicator_enabled: z.boolean().optional(),
      company_info: z.object({
        name: z.string().max(500),
        type: z.string().max(2000),
        services: z.string().max(20000),
        platforms: z.string().max(2000),
        catalog_link: z.string().max(1000),
        panel_link: z.string().max(1000),
        payments: z.string().max(2000),
      }).optional(),
      how_it_works: z.string().max(20000).optional(),
      never_offer_first: z.boolean().optional(),
      send_panel_on_price: z.boolean().optional(),
      faqs: z.array(z.object({
        q: z.string().min(1).max(1000),
        a: z.string().min(1).max(20000),
      })).max(500).optional(),
      services_realtime: z.boolean().optional(),
      price_query_instruction: z.string().max(20000).optional(),
      modules: z.record(z.string(), z.string().max(20000)).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    let patch = data;
    if (data.modules) {
      const { data: existing, error: readError } = await context.supabase
        .from("agent_config")
        .select("modules")
        .eq("user_id", context.userId)
        .eq("workspace_id", context.workspaceId)
        .maybeSingle();
      if (readError) throw new Error(readError.message);
      patch = {
        ...data,
        modules: {
          ...((existing?.modules ?? {}) as Record<string, string>),
          ...data.modules,
        },
      };

    }
    const { error } = await context.supabase
      .from("agent_config")
      .upsert({ user_id: context.userId, workspace_id: context.workspaceId, ...patch }, { onConflict: "user_id,workspace_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveAgentModules = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      modules: z.record(z.string(), z.string().max(20000)),
      modules_enabled: z.record(z.string(), z.boolean()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: existing, error: readError } = await context.supabase
      .from("agent_config")
      .select("modules, modules_enabled")
      .eq("user_id", context.userId)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    const payload = {
      user_id: context.userId,
      workspace_id: context.workspaceId,
      modules: {
        ...((existing?.modules ?? {}) as Record<string, string>),
        ...data.modules,
      },

      ...(data.modules_enabled
        ? {
            modules_enabled: {
              ...(((existing?.modules_enabled ?? {}) as Record<string, boolean>) || {}),
              ...data.modules_enabled,
            },
          }
        : {}),
    };
    const { error } = await context.supabase
      .from("agent_config")
      .upsert(payload, { onConflict: "user_id,workspace_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveBehavior = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      response_delay_min_sec: z.number().int().min(0).max(600),
      response_delay_max_sec: z.number().int().min(0).max(600),
      typing_indicator_enabled: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const min = Math.min(data.response_delay_min_sec, data.response_delay_max_sec);
    const max = Math.max(data.response_delay_min_sec, data.response_delay_max_sec);
    const { error } = await context.supabase
      .from("agent_config")
      .upsert(
        {
          user_id: context.userId,
          workspace_id: context.workspaceId,
          response_delay_min_sec: min,
          response_delay_max_sec: max,
          typing_indicator_enabled: data.typing_indicator_enabled,
        },
        { onConflict: "user_id,workspace_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Save the two reference panel screenshots (mobile + desktop) used by the
// "Guia Visual do Painel" module so the agent has visual context of where
// each menu lives.
export const savePanelScreenshots = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      panel_screenshot_mobile_url: z.string().max(10000).nullable().optional(),
      panel_screenshot_desktop_url: z.string().max(10000).nullable().optional(),
      panel_screenshots_mobile: z
        .array(z.object({ url: z.string().max(10000), path: z.string().max(1000).optional(), label: z.string().max(200).optional() }))
        .max(50)
        .optional(),
      panel_screenshots_desktop: z
        .array(z.object({ url: z.string().max(10000), path: z.string().max(1000).optional(), label: z.string().max(200).optional() }))
        .max(50)
        .optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { user_id: context.userId, workspace_id: context.workspaceId };
    if (data.panel_screenshot_mobile_url !== undefined)
      patch.panel_screenshot_mobile_url = data.panel_screenshot_mobile_url;
    if (data.panel_screenshot_desktop_url !== undefined)
      patch.panel_screenshot_desktop_url = data.panel_screenshot_desktop_url;
    if (data.panel_screenshots_mobile !== undefined)
      patch.panel_screenshots_mobile = data.panel_screenshots_mobile;
    if (data.panel_screenshots_desktop !== undefined)
      patch.panel_screenshots_desktop = data.panel_screenshots_desktop;
    const { error } = await context.supabase
      .from("agent_config")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(patch as any, { onConflict: "user_id,workspace_id" });
    if (error) throw new Error(error.message);

    // Também sincroniza com a tabela `panel_guide`, que é a fonte usada pelo
    // webhook no prompt do Claude. A análise visual fica sob demanda: se ainda
    // não houver extracted_content, o webhook analisa quando o cliente pedir
    // ajuda sobre o painel.
    const syncSlot = async (
      slot: "mobile" | "desktop",
      items: Array<{ url: string; path?: string; label?: string }> | undefined,
    ) => {
      if (items === undefined) return;
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const normalizedItems = items.map((it) => ({
        ...it,
        path: it.path ?? extractPanelGuideStoragePath(it.url) ?? undefined,
      }));
      const paths = normalizedItems.map((it) => it.path).filter(Boolean) as string[];
      if (paths.length > 0) {
        await supabaseAdmin
          .from("panel_guide")
          .delete()
          .eq("user_id", context.userId)
          .eq("source_slot", slot)
          .not("storage_path", "in", `(${paths.map((p) => `"${p.replaceAll('"', '\\"')}"`).join(",")})`);
      } else {
        await supabaseAdmin.from("panel_guide").delete().eq("user_id", context.userId).eq("source_slot", slot);
      }

      for (const [index, item] of normalizedItems.entries()) {
        const storagePath = item.path ?? null;
        const name = item.label?.trim() || `${slot === "mobile" ? "Celular" : "Desktop"} ${index + 1}`;
        const description = slot === "mobile" ? "Print do painel aberto no celular" : "Print do painel aberto no desktop/PC";
        if (storagePath) {
          const { data: existing } = await supabaseAdmin
            .from("panel_guide")
            .select("id, extracted_content")
            .eq("user_id", context.userId)
            .eq("storage_path", storagePath)
            .maybeSingle();
          if (existing?.id) {
            await supabaseAdmin
              .from("panel_guide")
              .update({ name, description, image_url: item.url, source_slot: slot } as never)
              .eq("id", existing.id);
          } else {
            await supabaseAdmin.from("panel_guide").insert({
              user_id: context.userId,
              name,
              description,
              image_url: item.url,
              storage_path: storagePath,
              source_slot: slot,
              extracted_content: null,
            } as never);
          }
        }
      }
    };

    await syncSlot("mobile", data.panel_screenshots_mobile);
    await syncSlot("desktop", data.panel_screenshots_desktop);
    return { ok: true };
  });

// Toggle "Consultar preços em tempo real"
export const setServicesRealtime = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agent_config")
      .upsert(
        { user_id: context.userId, workspace_id: context.workspaceId, services_realtime: data.enabled },
        { onConflict: "user_id,workspace_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, services_realtime: data.enabled };
  });

export const getPriceTable = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("price_table")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  });

export const savePriceTable = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      rows: z.array(
        z.object({
          id: z.string().uuid().optional(),
          platform: z.string().min(1),
          service: z.string().min(1),
          audience: z.string().min(1),
          price_per_1000: z.number().min(0),
          min_quantity: z.number().int().min(0),
          max_quantity: z.number().int().min(0),
          is_active: z.boolean(),
        }),
      ),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // 1. Delete rows not in the incoming data (if they have IDs)
    const incomingIds = data.rows.map((r) => r.id).filter(Boolean) as string[];
    
    if (incomingIds.length > 0) {
      const { error: delError } = await context.supabase
        .from("price_table")
        .delete()
        .eq("workspace_id", context.workspaceId)
        .not("id", "in", `(${incomingIds.map(id => `"${id}"`).join(",")})`);
      if (delError) throw new Error(delError.message);
    } else {
      const { error: delError } = await context.supabase
        .from("price_table")
        .delete()
        .eq("workspace_id", context.workspaceId);
      if (delError) throw new Error(delError.message);
    }

    // 2. Upsert the current rows
    const toUpsert = data.rows.map((r) => ({
      ...r,
      user_id: context.userId,
      workspace_id: context.workspaceId,
    }));

    if (toUpsert.length > 0) {
      const { error } = await context.supabase.from("price_table").upsert(toUpsert);
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });


// Toggles do catálogo em cache
export const setCatalogFlags = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      catalog_in_prompt: z.boolean().optional(),
      catalog_only_relevant: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      user_id: string;
      workspace_id: string;
      catalog_in_prompt?: boolean;
      catalog_only_relevant?: boolean;
    } = { user_id: context.userId, workspace_id: context.workspaceId };
    if (typeof data.catalog_in_prompt === "boolean") patch.catalog_in_prompt = data.catalog_in_prompt;
    if (typeof data.catalog_only_relevant === "boolean") patch.catalog_only_relevant = data.catalog_only_relevant;
    const { error } = await context.supabase
      .from("agent_config")
      .upsert(patch, { onConflict: "user_id,workspace_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Retorna os metadados dos módulos V2 registrados no runtime.
// Agora busca do banco de dados se existirem, permitindo edição.
export const listModulesV2 = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const supabase = context.supabase as any;
    console.log(`[AGENTE_PAGE] listModulesV2_started for workspace: ${context.workspaceId}`);
    
    // Usamos o supabaseAdmin para o loader para garantir o carregamento independente de RLS do usuário,
    // já que o controle de acesso ao workspace Mind é feito no middleware.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const { data: dbModules, error } = await supabaseAdmin
      .from("agent_modules_v2")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .order("category", { ascending: true })
      .order("priority", { ascending: false });

    if (error) {
      console.error(`[AGENTE_PAGE] listModulesV2_error: ${error.message}`);
      throw new Error(error.message);
    }
    
    console.log(`[AGENTE_PAGE] listModulesV2_result_count: ${dbModules?.length || 0}`);


    // Se não houver módulos no banco para este workspace, migramos do hardcoded Module Registry
    if (!dbModules || dbModules.length === 0) {
      const { moduleRegistryV2 } = await import("./agent-v2/module-registry");
      const friendlyNames: Record<string, { title: string; emoji: string; category: string; description: string }> = {
        mission: { title: "Missão", emoji: "🚀", category: "Core", description: "Objetivo fundamental e restrições de venda do agente." },
        identity: { title: "Identidade", emoji: "🪪", category: "Core", description: "Persona da Júlia, tom de voz e estilo de escrita." },
        guards: { title: "Guardas", emoji: "🚫", category: "Core", description: "Regras de segurança e integridade absoluta." },
        receptive: { title: "Receptivo", emoji: "📥", category: "Modo", description: "Lógica para mensagens de entrada iniciadas pelo cliente." },
        outbound: { title: "Disparo", emoji: "📣", category: "Modo", description: "Lógica para respostas a campanhas e disparos ativos." },
        commercial: { title: "Comercial", emoji: "🛒", category: "Vendas", description: "Regras de condução de venda e fechamento no painel." },
        spotify: { title: "Spotify (Fallback)", emoji: "🎵", category: "Redes", description: "Módulo legado para compatibilidade." },
        spotify_overview: { title: "Spotify (Geral)", emoji: "🎵", category: "Redes", description: "Visão geral e qualificação para Spotify." },
        spotify_playlist: { title: "Spotify (Playlist)", emoji: "🎼", category: "Redes", description: "Serviços de playlist e divulgação de faixas." },
        spotify_followers: { title: "Spotify (Seguidores)", emoji: "👤", category: "Redes", description: "Serviços de seguidores e base de fãs." },
        instagram: { title: "Instagram", emoji: "📸", category: "Redes", description: "Serviços de seguidores e engajamento no Instagram." },
        youtube: { title: "YouTube", emoji: "▶️", category: "Redes", description: "Serviços de inscritos e views para YouTube." },
        tiktok: { title: "TikTok", emoji: "🎬", category: "Redes", description: "Serviços de seguidores e views para TikTok." },
        facebook: { title: "Facebook", emoji: "👍", category: "Redes", description: "Serviços de páginas e perfis Facebook." },
        kwai: { title: "Kwai", emoji: "🌟", category: "Redes", description: "Serviços de seguidores e curtidas para Kwai." },
        panel: { title: "Painel Oficial", emoji: "🧭", category: "Ferramentas", description: "Instruções de acesso e cadastro no painel Mind." },
        payments: { title: "Pagamentos", emoji: "💳", category: "Ferramentas", description: "Métodos de recarga, PIX e valores mínimos." },
        tutorials: { title: "Tutoriais", emoji: "🎓", category: "Ferramentas", description: "Base de tutoriais passo a passo da plataforma." },
        free_test: { title: "Teste Grátis", emoji: "🎁", category: "Ferramentas", description: "Regras e oferta de teste gratuito qualificado." },
        support: { title: "Suporte", emoji: "🛠️", category: "Ferramentas", description: "Direcionamento para tickets de suporte técnico." },
      };

      const toInsert = Object.keys(moduleRegistryV2).map(key => {
        const info = friendlyNames[key] || { title: key, emoji: "🧩", category: "Outros", description: "" };
        const content = (moduleRegistryV2 as Record<string, string>)[key] || "";
        return {
          id: key,
          workspace_id: context.workspaceId,
          user_id: context.userId,
          title: info.title,
          emoji: info.emoji,
          category: info.category,
          description: info.description,
          content: content,
          priority: ["mission", "identity", "guards"].includes(key) ? "Alta" : "Normal",
          is_core: ["mission", "identity", "guards"].includes(key),
          is_active: true,
          modes: key === "receptive" ? ["receptive"] : (key === "outbound" ? ["outbound"] : ["all"]),
          dependencies: key.startsWith("spotify_") ? ["spotify_overview"] : []
        };
      });

      const { data: inserted, error: insError } = await supabase
        .from("agent_modules_v2")
        .insert(toInsert)
        .select();

      if (insError) throw new Error(`Erro ao migrar módulos: ${insError.message}`);
      return (inserted || []).map((m: any) => ({ ...m, contentPreview: (m.content || "").slice(0, 150) + "..." }));
    }


    return dbModules.map((m: any) => ({
      ...m,
      contentPreview: (m.content || "").slice(0, 150) + "..."
    }));
  });

export const updateModuleV2 = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({
    id: z.string(),
    title: z.string().min(1),
    description: z.string().optional(),
    content: z.string().min(1),
    priority: z.string(),
    category: z.string(),
    is_active: z.boolean(),
    modes: z.array(z.string()),
    dependencies: z.array(z.string()),
    is_core: z.boolean()
  }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    // 1. Get current version for history
    const { data: current } = await supabase
      .from("agent_modules_v2")
      .select("version, content")
      .eq("workspace_id", context.workspaceId)
      .eq("id", data.id)
      .single();

    if (current) {
      // 2. Save history
      await supabase.from("agent_modules_v2_history").insert({
        module_id: data.id,
        workspace_id: context.workspaceId,
        version: current.version,
        content: current.content,
        modified_by: context.userId
      });
    }

    // 3. Update module
    const { error } = await supabase
      .from("agent_modules_v2")
      .update({
        ...data,
        version: (current?.version || 0) + 1,
        updated_at: new Date().toISOString(),
        last_modified_by: context.userId
      })
      .eq("workspace_id", context.workspaceId)
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getModuleHistoryV2 = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ id: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: history, error } = await supabase
      .from("agent_modules_v2_history")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .eq("module_id", data.id)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return history || [];
  });




// Toggle global agent on/off (sidebar switch)

export const setAgentGlobalEnabled = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: saved, error } = await context.supabase
      .from("agent_config")
      .upsert({ user_id: context.userId, workspace_id: context.workspaceId, agent_enabled: data.enabled }, { onConflict: "user_id,workspace_id" })
      .select("agent_enabled")
      .single();
    if (error) throw new Error(error.message);
    // Cascade to every conversation owned by this user (and shared uazapi peers)
    // so the sidebar toggle is the single source of truth.
    const userIds = await getSharedUazapiUserIds(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch = data.enabled
      ? {
          agent_enabled: true,
          needs_review: false,
          review_reason: null,
          auto_paused_at: null,
          internal_note: null,
        }
      : { agent_enabled: false };
    const { error: convErr } = await supabaseAdmin
      .from("conversations")
      .update(patch)
      .in("user_id", userIds)
      .eq("workspace_id", context.workspaceId);
    if (convErr) throw new Error(convErr.message);
    return { ok: true, agent_enabled: saved.agent_enabled };
  });

// Toggle agent on/off for a single conversation
export const setConversationAgentEnabled = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({ conversationId: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const userIds = await getSharedUazapiUserIds(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin
      .from("conversations")
      .update({
        agent_enabled: data.enabled,
        ...(data.enabled
          ? {
              needs_review: false,
              review_reason: null,
              auto_paused_at: null,
              internal_note: null,
              status: "aguardando",
            }
          : {}),
      })
      .eq("id", data.conversationId)
      .in("user_id", userIds)
      .or(`workspace_id.eq.${context.workspaceId},user_id.neq.${context.userId}`)
      .select("id, agent_enabled, contact_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Conversa não encontrada ou sem permissão para alterar.");
    if (data.enabled && updated.contact_id) {
      await supabaseAdmin
        .from("contacts")
        .update({
          status: "em_conversa",
          temperatura: "frio",
          temperatura_updated_at: new Date().toISOString(),
        })
        .eq("id", updated.contact_id);
    }
    return { ok: true, agent_enabled: updated.agent_enabled };
  });

// Reactivate a conversation that was auto-paused due to unproductive behavior.
// Clears the review flag, re-enables the agent, and unblocks the contact.
export const reactivateConversation = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ conversationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const userIds = await getSharedUazapiUserIds(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conv, error: convErr } = await supabaseAdmin
      .from("conversations")
      .update({
        agent_enabled: true,
        needs_review: false,
        review_reason: null,
        auto_paused_at: null,
        internal_note: null,
        status: "aguardando",
      })
      .eq("id", data.conversationId)
      .in("user_id", userIds)
      .or(`workspace_id.eq.${context.workspaceId},user_id.neq.${context.userId}`)
      .select("id, contact_id")
      .maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!conv) throw new Error("Conversa não encontrada.");
    await supabaseAdmin
      .from("contacts")
      .update({ status: "em_conversa", temperatura: "frio", temperatura_updated_at: new Date().toISOString() })
      .eq("id", conv.contact_id);
    return { ok: true };
  });

// Manually block a conversation: pauses the agent and flags it for review.
export const blockConversation = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({ conversationId: z.string().uuid(), reason: z.string().max(200).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const userIds = await getSharedUazapiUserIds(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conv, error } = await supabaseAdmin
      .from("conversations")
      .update({
        agent_enabled: false,
        needs_review: true,
        review_reason: data.reason ?? "bloqueado manualmente",
        auto_paused_at: new Date().toISOString(),
        internal_note: "Conversa bloqueada manualmente pelo painel.",
      })
      .eq("id", data.conversationId)
      .in("user_id", userIds)
      .or(`workspace_id.eq.${context.workspaceId},user_id.neq.${context.userId}`)
      .select("id, contact_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!conv) throw new Error("Conversa não encontrada.");
    await supabaseAdmin
      .from("contacts")
      .update({ status: "bloqueado", temperatura: "bloqueado", temperatura_updated_at: new Date().toISOString() })
      .eq("id", conv.contact_id);
    return { ok: true };
  });

// Counter for the sidebar badge ("conversas para revisar").
export const countConversationsToReview = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const userIds = await getSharedUazapiUserIds(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error } = await supabaseAdmin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .in("user_id", userIds)
      .eq("workspace_id", context.workspaceId)
      .eq("needs_review", true);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const countAgentErrors = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await context.supabase
      .from("agent_logs")
      .select("id", { count: "exact", head: true })
      .eq("level", "error")
      .gte("created_at", since);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const getIntegrations = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("integrations")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const mask0 = (v: unknown) => (typeof v === "string" && v.length > 0 ? "••••••" : null);
    if (!data) {
      return {
        anthropic_api_key: mask0(process.env.ANTHROPIC_API_KEY),
        openai_api_key: mask0(process.env.OPENAI_API_KEY),
      };
    }
    // Mask secret values before returning to the browser: expose only whether
    // each credential is configured, never the raw token/key.
    const mask = (v: unknown) => (typeof v === "string" && v.length > 0 ? "••••••" : null);
    return {
      ...data,
      uazapi_token: mask(data.uazapi_token),
      uazapi_admin_token: mask(data.uazapi_admin_token),
      anthropic_api_key: mask(data.anthropic_api_key) ?? mask(process.env.ANTHROPIC_API_KEY),
      elevenlabs_api_key: mask(data.elevenlabs_api_key),
      openai_api_key: mask(data.openai_api_key) ?? mask(process.env.OPENAI_API_KEY),
      smm_api_key: mask(data.smm_api_key),
    };
  });

export const saveIntegrations = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      uazapi_url: z.string().max(500).optional().nullable(),
      uazapi_token: z.string().max(500).optional().nullable(),
      uazapi_admin_token: z.string().max(500).optional().nullable(),
      anthropic_api_key: z.string().max(500).optional().nullable(),
      elevenlabs_api_key: z.string().max(500).optional().nullable(),
      elevenlabs_voice_id: z.string().max(200).optional().nullable(),
      openai_api_key: z.string().max(500).optional().nullable(),
      smm_api_key: z.string().max(500).optional().nullable(),
      smm_service_id: z.string().max(50).optional().nullable(),
      smm_panel_url: z.string().max(500).optional().nullable(),
      free_trial_enabled: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Strip masked secret values so we don't overwrite real secrets when the
    // UI re-submits the form with the placeholder from getIntegrations.
    const SECRET_FIELDS = [
      "uazapi_token",
      "uazapi_admin_token",
      "anthropic_api_key",
      "elevenlabs_api_key",
      "openai_api_key",
      "smm_api_key",
    ] as const;
    const clean: Record<string, unknown> = { ...data };
    for (const k of SECRET_FIELDS) {
      const v = (clean as Record<string, unknown>)[k];
      if (typeof v === "string" && /^•+$/.test(v)) delete clean[k];
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("integrations")
      .upsert({ user_id: context.userId, workspace_id: context.workspaceId, ...clean }, { onConflict: "user_id,workspace_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const previewVoice = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({ text: z.string().min(1).max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: integ, error } = await supabaseAdmin
      .from("integrations")
      .select("elevenlabs_api_key, elevenlabs_voice_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!integ?.elevenlabs_api_key || !integ.elevenlabs_voice_id) {
      throw new Error("Configure a API Key e o Voice ID do ElevenLabs antes.");
    }
    const { ttsElevenLabsBase64 } = await import("@/lib/agent-v2/core/ai-services.server");
    const audio = await ttsElevenLabsBase64({
      apiKey: integ.elevenlabs_api_key,
      voiceId: integ.elevenlabs_voice_id,
      text: data.text ?? "Oi! Aqui é a sua agente vendedora. Tudo certo com a voz?",
    });
    return { audio };
  });
