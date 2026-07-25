import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";
import { loadAgentConfigV3 } from "../brain/config.server";
import { selectModulesV3 } from "../selector/module-selector.server";
import { buildPromptFromModulesDetailed } from "../prompt/prompt-builder.server";
import { invalidateModulesCache, loadEnabledModulesV3 } from "../brain/modules.server";

type BootstrapModuleV3 = {
  key: string;
  name: string;
  category: string;
  content: string;
  priority: number;
  selectorIntents?: string[];
  selectorStages?: string[];
  selectorPlatforms?: string[];
  selectorProducts?: string[];
  selectorTriggers?: string[];
};

async function ensurePlatformSubmodulesV3(params: {
  supabase: any;
  userId: string;
  workspaceId: string;
}) {
  const { supabase, userId, workspaceId } = params;

  const { data: existingRows, error: existingErr } = await supabase
    .from("agent_modules_v3")
    .select("key, content, version, enabled")
    .eq("workspace_id", workspaceId);

  if (existingErr) {
    console.warn("[v3-admin-bootstrap] Não foi possível verificar submódulos:", existingErr);
    return;
  }

  const existing = new Map<string, any>(
    (existingRows || []).map((row: any) => [String(row.key || "").toLowerCase(), row]),
  );

  const hasPlatformKnowledge =
    existing.has("spotify") ||
    existing.has("youtube") ||
    Array.from(existing.keys()).some(
      (key) => key.startsWith("spotify_") || key.startsWith("youtube_"),
    );

  if (!hasPlatformKnowledge) return;

  const modules: BootstrapModuleV3[] = [
    {
      key: "spotify_servicos",
      name: "Spotify — Serviços",
      category: "Spotify",
      priority: 82,
      selectorPlatforms: ["spotify"],
      content: `MÓDULO SPOTIFY — SERVIÇOS
Use somente para apresentar o que existe no Spotify.
Serviços: Plays + Ouvintes, Seguidores, Saves e divulgação de 1 música em 10 Playlists.
Playlists: Eclética (gêneros populares) ou Eletrônica (electronic/house/techno/trance/deep house).
Toda compra é feita no painel mindsmmpanel.com.
Não despeje detalhes de preço, prazo, garantia ou royalties se o cliente não perguntou.`,
    },
    {
      key: "spotify_precos",
      name: "Spotify — Preços",
      category: "Spotify",
      priority: 95,
      selectorIntents: ["consulta_preco", "compra"],
      selectorStages: ["negociacao", "fechamento"],
      selectorPlatforms: ["spotify"],
      selectorProducts: ["plays", "ouvintes", "saves", "seguidores", "playlist"],
      selectorTriggers: ["preço","preco","valor","quanto custa","quanto fica","mínimo","minimo","500","1000","mil"],
      content: `MÓDULO SPOTIFY — PREÇOS
Fonte única de preços, mínimos, máximos e velocidades:
- Plays + Ouvintes: 1.000 = R$ 15,00 | mín 500 | máx 500.000 | aprox. 100–150/dia.
- Seguidores: 1.000 = R$ 30,00 | mín 100 | máx 500.000 | aprox. 500–1.000/dia.
- Saves: 1.000 = R$ 10,00 | mín 100 | máx 50.000 | aprox. 500/dia.
- 1 música em 10 Playlists: R$ 49,90 | permanência 30 dias | aprox. 50–100 plays/dia.
Para outra quantidade, calcule proporcionalmente ao preço base e respeite mín/máx.
Se perguntarem se pode comprar menos, informe já o mínimo e o valor correspondente.
Ex.: 500 Plays + Ouvintes = R$ 7,50.`,
    },
    {
      key: "spotify_prazos",
      name: "Spotify — Prazos e Atualização",
      category: "Spotify",
      priority: 90,
      selectorIntents: ["suporte", "pos_compra"],
      selectorStages: ["pos_venda", "suporte"],
      selectorPlatforms: ["spotify"],
      selectorTriggers: ["prazo","demora","quanto tempo","concluído","concluido","atualizou","atualizar","72 horas","24 horas","não apareceu","nao apareceu"],
      content: `MÓDULO SPOTIFY — PRAZOS
- Início do processamento: até 24h após o pedido.
- Conclusão depende do serviço, quantidade e velocidade de entrega; velocidade é aproximada, não prazo exato.
- Após o pedido aparecer "Concluído" no painel, o Spotify pode levar até 72h adicionais para atualizar totalmente a contagem.
- O Spotify não atualiza todas as métricas em tempo real.
Se estiver concluído no painel mas ainda não atualizado no Spotify, orientar a aguardar até 72h antes de considerar problema.`,
    },
    {
      key: "spotify_links",
      name: "Spotify — Links e Distribuição",
      category: "Spotify",
      priority: 91,
      selectorPlatforms: ["spotify"],
      selectorTriggers: ["link","álbum","album","artista","perfil","faixa","música","musica","dividido","dividir","top 10"],
      content: `MÓDULO SPOTIFY — LINKS
Plays + Ouvintes aceita link de música, álbum, playlist ou artista.
- Música: entrega concentrada na faixa.
- Álbum/Playlist: quantidade é distribuída entre as faixas. Referência: 500 plays em 10 faixas ≈ 50 por faixa.
- Artista: entrega distribuída no Top 10 do artista.
Seguidores: link do perfil. Saves: link da música. Playlists: link da música.
Se quiser concentrar em uma música, recomende link direto da faixa.
Não peça link como pré-requisito para fechar a venda; o cliente informa o link ao criar o pedido no painel. Explique o tipo de link quando houver dúvida.`,
    },
    {
      key: "spotify_ouvintes",
      name: "Spotify — Plays e Ouvintes",
      category: "Spotify",
      priority: 92,
      selectorPlatforms: ["spotify"],
      selectorProducts: ["plays", "ouvintes"],
      selectorTriggers: ["ouvintes","ouvinte mensal","ouvintes mensais","28 dias","600","900","plays são ouvintes","plays sao ouvintes"],
      content: `MÓDULO SPOTIFY — PLAYS E OUVINTES
Plays e ouvintes mensais são métricas diferentes.
- Plays permanecem contabilizados no histórico da música.
- Ouvintes mensais usam uma janela móvel de aproximadamente 28 dias e podem diminuir com o tempo.
- Nunca prometa 1 play = 1 ouvinte.
Referência aproximada: 1.000 plays podem gerar 600–900 ouvintes, pois a mesma pessoa pode ouvir mais de uma vez.`,
    },
    {
      key: "spotify_garantia",
      name: "Spotify — Garantia",
      category: "Spotify",
      priority: 93,
      selectorIntents: ["duvida_seguranca","suporte","pos_compra"],
      selectorPlatforms: ["spotify"],
      selectorTriggers: ["garantia","reposição","reposicao","caiu","queda","repor","reposição vitalícia","reposicao vitalicia"],
      content: `MÓDULO SPOTIFY — GARANTIA
Regra geral: serviços com link que permite conferir corretamente contagem inicial e entrega possuem garantia vitalícia de reposição.
Exceção: Plays + Ouvintes com link de Artista, Álbum ou Playlist NÃO têm garantia de reposição, pois a entrega é distribuída e não é possível conferir com precisão a contagem inicial individual.
Para facilitar conferência e manter a garantia aplicável, recomende link direto da música quando possível.
Nunca diga que Artista/Álbum/Playlist possuem garantia para Plays + Ouvintes.`,
    },
    {
      key: "spotify_playlists",
      name: "Spotify — Playlists",
      category: "Spotify",
      priority: 94,
      selectorPlatforms: ["spotify"],
      selectorProducts: ["playlist"],
      selectorTriggers: ["playlist","playlists","eclética","ecletica","eletrônica","eletronica","gênero","genero"],
      content: `MÓDULO SPOTIFY — PLAYLISTS
Pacote: 1 música em 10 playlists por R$ 49,90, permanência de 30 dias, entrega aproximada de 50–100 plays/dia.
Gêneros:
- Eclética: gêneros populares como pagode, gospel, reggae, samba, funk, hip hop, forró, axé, MPB, pop, rock, sertanejo, trap, R&B e soul.
- Eletrônica: somente electronic/house/techno/trance/deep house.
Para contratar, usa link direto da música.`,
    },
    {
      key: "spotify_royalties",
      name: "Spotify — Royalties",
      category: "Spotify",
      priority: 89,
      selectorPlatforms: ["spotify"],
      selectorTriggers: ["royalty","royalties","monetização","monetizacao","distribuidora","receber dinheiro","ganhar dinheiro","quanto ganha","quanto vou ganhar","como vou receber","quanto paga","paga mais","pagamento spotify","spotify paga"],
      content: `MÓDULO SPOTIFY — ROYALTIES
A Mind não controla monetização do Spotify nem pagamentos da distribuidora.
Nunca prometa ganhos financeiros ou royalties como resultado do serviço.
A Mind não se responsabiliza por pagamentos, retenções, elegibilidade de monetização ou decisões do Spotify/distribuidora.
Se perguntarem se receberá royalties: informe que não é possível garantir; monetização e pagamento são definidos pelo Spotify e pela distribuidora.`,
    },
    {
      key: "youtube_geral",
      name: "YouTube — Geral",
      category: "YouTube",
      priority: 82,
      selectorPlatforms: ["youtube"],
      content: `MÓDULO YOUTUBE — GERAL
No YouTube trabalhamos com os serviços cadastrados nos módulos específicos.
Quando o cliente apenas disser "YouTube", pergunte qual serviço procura, sem despejar tabela.
Use "inscritos" para canal e "visualizações/views" para vídeos; não use "plays".
Toda compra é feita no painel mindsmmpanel.com.`,
    },
    {
      key: "youtube_links",
      name: "YouTube — Links e Orientação",
      category: "YouTube",
      priority: 82,
      selectorPlatforms: ["youtube"],
      selectorTriggers: ["link","vídeo","video","álbum","album","playlist","canal"],
      content: `MÓDULO YOUTUBE — LINKS
Use o link correspondente ao conteúdo que receberá o serviço.
Não peça link antes do fechamento; o cliente informa o link no pedido do painel.
Se houver dúvida sobre vídeo, álbum ou playlist, explique somente o necessário para evitar pedido incorreto.
Não confirme que um link recebeu serviço apenas porque o cliente o enviou.`,
    },
  ];

  const youtubeLegacy = existing.get("youtube");
  if (!existing.has("youtube_servicos") && youtubeLegacy?.content) {
    modules.push({
      key: "youtube_servicos",
      name: "YouTube — Serviços e Preços",
      category: "YouTube",
      priority: 90,
      selectorIntents: ["descoberta","consulta_preco","compra"],
      selectorStages: ["apresentacao","negociacao","fechamento"],
      selectorPlatforms: ["youtube"],
      selectorProducts: ["visualizacoes","inscritos","curtidas","live","horas","comentarios"],
      selectorTriggers: ["youtube","yt","visualizações","visualizacoes","views","likes","inscritos","premium","global","live","horas"],
      content: youtubeLegacy.content,
    });
  }

  const missing = modules.filter((item) => !existing.has(item.key));
  if (missing.length > 0) {
    const rows = missing.map((item) => ({
      user_id: userId,
      workspace_id: workspaceId,
      key: item.key,
      name: item.name,
      category: item.category,
      content: item.content,
      enabled: true,
      version: 1,
      priority: item.priority,
      always_load: false,
      selector_intents: item.selectorIntents || [],
      selector_stages: item.selectorStages || [],
      selector_platforms: item.selectorPlatforms || [],
      selector_products: item.selectorProducts || [],
      selector_triggers: item.selectorTriggers || [],
      selector_dependencies: [],
      selector_conflicts: [],
      updated_at: new Date().toISOString(),
    }));

    const { error: insertErr } = await supabase
      .from("agent_modules_v3")
      .upsert(rows, {
        onConflict: "workspace_id,key",
        ignoreDuplicates: true,
      });

    if (insertErr) {
      console.error("[v3-admin-bootstrap] Falha ao criar submódulos:", insertErr);
      throw insertErr;
    }
  }

  const requiredSpotify = [
    "spotify_servicos","spotify_precos","spotify_prazos","spotify_links",
    "spotify_ouvintes","spotify_garantia","spotify_playlists","spotify_royalties",
  ];
  const afterKeys = new Set([...existing.keys(), ...missing.map((m) => m.key)]);

  if (requiredSpotify.every((key) => afterKeys.has(key)) && existing.get("spotify")?.enabled !== false) {
    await supabase
      .from("agent_modules_v3")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("key", "spotify");
  }

  if (afterKeys.has("youtube_servicos") && afterKeys.has("youtube_geral") && existing.get("youtube")?.enabled !== false) {
    await supabase
      .from("agent_modules_v3")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .eq("key", "youtube");
  }

  if (missing.length > 0) invalidateModulesCache(workspaceId);
}


export const getFullAgentV3Config = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { supabase, workspaceId } = context;

    await ensurePlatformSubmodulesV3({
      supabase,
      userId: context.userId,
      workspaceId,
    });

    const config = await loadAgentConfigV3(context.userId, workspaceId);
    // Load modules from DB
    const { data: dbModules } = await supabase
      .from("agent_modules_v3")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("priority", { ascending: false });

    const allModules: Record<string, any> = {};
    for (const m of dbModules || []) {
      allModules[m.key] = {
        id: m.id,
        content: m.content,
        isOverride: true,
        enabled: m.enabled,
        category: m.category || "Outros",
        name: m.name || m.key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        version: m.version,
        priority: m.priority ?? 0,
        updated_at: m.updated_at,
        always_load: (m as any).always_load ?? false,
        selector_intents: (m as any).selector_intents ?? [],
        selector_stages: (m as any).selector_stages ?? [],
        selector_platforms: (m as any).selector_platforms ?? [],
        selector_products: (m as any).selector_products ?? [],
        selector_triggers: (m as any).selector_triggers ?? [],
        selector_dependencies: (m as any).selector_dependencies ?? [],
        selector_conflicts: (m as any).selector_conflicts ?? [],
      };
    }

    return { config, modules: allModules, defaults: {} };
  });

export const updateV3Module = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z
      .object({
        moduleKey: z.string().trim().min(1).max(120),
        content: z.string().max(20000),
        name: z.string().optional(),
        category: z.string().optional(),
        priority: z.number().optional(),
        enabled: z.boolean().optional(),
        alwaysLoad: z.boolean().optional(),
        selectorIntents: z.array(z.string()).optional(),
        selectorStages: z.array(z.string()).optional(),
        selectorPlatforms: z.array(z.string()).optional(),
        selectorProducts: z.array(z.string()).optional(),
        selectorTriggers: z.array(z.string()).optional(),
        selectorDependencies: z.array(z.string()).optional(),
        selectorConflicts: z.array(z.string()).optional(),
        id: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, workspaceId } = context;
    const moduleKey = data.moduleKey.trim().toLowerCase();

    // 1. Get current module to increment version
    const { data: current, error: currentError } = await supabase
      .from("agent_modules_v3")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("key", moduleKey)
      .maybeSingle();

    if (currentError) throw currentError;

    const newVersion = (current?.version || 0) + 1;

    // 2. Upsert the module
    const { data: updated, error } = await supabase
      .from("agent_modules_v3")
      .upsert(
        {
          id: current?.id || data.id,
          user_id: userId,
          workspace_id: workspaceId,
          key: moduleKey,
          name:
            data.name ||
            current?.name ||
            moduleKey.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          content: data.content,
          category: data.category || current?.category || "Outros",
          priority: data.priority ?? current?.priority ?? 50,
          enabled: data.enabled ?? current?.enabled ?? true,
          always_load: data.alwaysLoad ?? (current as any)?.always_load ?? false,
          selector_intents: (data.selectorIntents ?? (current as any)?.selector_intents ?? []) as any,
          selector_stages: (data.selectorStages ?? (current as any)?.selector_stages ?? []) as any,
          selector_platforms: (data.selectorPlatforms ?? (current as any)?.selector_platforms ?? []) as any,
          selector_products: (data.selectorProducts ?? (current as any)?.selector_products ?? []) as any,
          selector_triggers: (data.selectorTriggers ?? (current as any)?.selector_triggers ?? []) as any,
          selector_dependencies: (data.selectorDependencies ?? (current as any)?.selector_dependencies ?? []) as any,
          selector_conflicts: (data.selectorConflicts ?? (current as any)?.selector_conflicts ?? []) as any,
          version: newVersion,
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: "workspace_id,key" },
      )
      .select()
      .single();

    if (error) throw error;

    // 3. Save history
    if (updated) {
      const { error: historyError } = await supabase.from("agent_modules_v3_history").insert({
        module_id: updated.id,
        content: data.content,
        version: newVersion,
        created_by: userId,
      });
      if (historyError) {
        console.warn("[v3-admin] Módulo salvo, mas o histórico não pôde ser registrado:", historyError);
      }
    }

    // 4. Invalidate cache
    invalidateModulesCache(workspaceId);

    return { ok: true, id: updated.id };
  });

export const deleteV3Module = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ moduleKey: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, workspaceId } = context;
    const moduleKey = data.moduleKey.trim().toLowerCase();

    const { error } = await supabase
      .from("agent_modules_v3")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("key", moduleKey);

    if (error) throw error;

    invalidateModulesCache(workspaceId);
    return { ok: true };
  });

export const getCompiledPromptV3 = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ message: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { workspaceId } = context;
    const activeModulesMap = await loadEnabledModulesV3(workspaceId);
    const message = data.message || "Olá";
    const selection = selectModulesV3(message, [], activeModulesMap);
    const selectedKeys = selection.selectedModules;
    const promptBuild = buildPromptFromModulesDetailed(selectedKeys, activeModulesMap);
    const modulePrompt = promptBuild.prompt;

    // Simplified version of the orchestrator logic to show the prompt
    const prompt = `
LEAD INTELLIGENCE:
[TEMP|CONF|INTENT|STAGE|PROB|SENT|URG|ACTION|REASON|SCORE|FEEDBACK]

ESTADO DA CONVERSA:
${modulePrompt}


REGRA DE CONCISÃO:
- Seja breve e cubra somente as informações necessárias para o próximo passo.
`;

    return {
      prompt: prompt.trim(),
      selectedModules: promptBuild.includedKeys,
      promptWarnings: promptBuild.warnings,
      selectionContext: selection.context,
      selectionReasons: selection.selectionReasons,
    };
  });
