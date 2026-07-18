import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";

/**
 * ONE-SHOT — Passo 1 do refactor safety-vs-brand.
 *
 * Copia byte-a-byte o conteúdo atual de DEFAULT_IDENTITY, DEFAULT_MODULES e
 * dos 3 blocos hardcoded (RESPOSTAS_PADRAO, REGRA_MQ_HQ, REGRA_AUTORIDADE)
 * para as linhas do workspace Mind em `agent_identity` e `agent_config`.
 *
 * Não altera nenhum código de runtime: enquanto `agent-shared.server.ts`
 * ainda ler os constants, o system prompt do Mind permanece byte-idêntico.
 * A seed é a base do banco pros passos 2/3/4 (esvaziar defaults e ler tudo
 * do DB).
 *
 * Guarda: exige que o caller seja o próprio dono do workspace Mind
 * (`MIND_USER_ID`), pra ninguém acidentalmente sobrescrever outro workspace.
 * Remover este arquivo depois da validação.
 */

const MIND_USER_ID = "09f4dee9-0a1b-4c43-b083-75cc64feb99d";
const MIND_WORKSPACE_ID = "bd59fa41-d68d-4ac8-b995-e09ae48f52aa";

export const seedMindBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (context.userId !== MIND_USER_ID) {
      throw new Error("Forbidden: only Mind owner can run this seed");
    }

    const [{ DEFAULT_IDENTITY, MIND_BRAND_BLOCKS }, { DEFAULT_MODULES }, { supabaseAdmin }] = await Promise.all([
      import("@/lib/agent-identity.server"),
      import("@/lib/agent-modules"),
      import("@/integrations/supabase/client.server"),
    ]);

    // 1) Upsert agent_identity com todos os 10 campos.
    const identityRow = {
      user_id: MIND_USER_ID,
      workspace_id: MIND_WORKSPACE_ID,
      ...DEFAULT_IDENTITY,
    };
    const { error: idErr } = await supabaseAdmin
      .from("agent_identity")
      .upsert(identityRow, { onConflict: "user_id,workspace_id" });
    if (idErr) throw new Error(`agent_identity: ${idErr.message}`);

    // 2) Update agent_config: modules e brand_blocks.
    const brandBlocks = MIND_BRAND_BLOCKS;
    const { error: cfgErr, count } = await supabaseAdmin
      .from("agent_config")
      .update({
        modules: DEFAULT_MODULES as never,
        brand_blocks: brandBlocks as never,
      })
      .eq("user_id", MIND_USER_ID)
      .eq("workspace_id", MIND_WORKSPACE_ID);
    if (cfgErr) throw new Error(`agent_config: ${cfgErr.message}`);

    return {
      ok: true,
      identity_fields: Object.keys(DEFAULT_IDENTITY).length,
      modules_count: Object.keys(DEFAULT_MODULES).length,
      brand_blocks: Object.keys(brandBlocks).length,
      agent_config_rows_updated: count ?? null,
    };
  });

/**
 * Passo 4 do refactor safety-vs-brand — SEED OPCIONAL DO TEMPLATE MIND.
 *
 * Copia APENAS os 3 campos brand da identidade (persona, terminologia_redes,
 * exemplo_disparo) + os 3 brand_blocks (respostas_padrao, regra_mq_hq,
 * regra_autoridade) do template Mind para o WORKSPACE ATIVO do caller.
 *
 * NÃO toca em campos SAFETY (regra_emoji, regra_split, regra_teste_gratis,
 * regra_anti_invencao, reconhecimento_interesse, regra_encerramento,
 * regra_estilo_escrita) — a customização de safety do workspace é preservada.
 *
 * Opt-in: só roda quando o usuário clicar no botão da UI. Serve pra quem
 * quiser usar a Júlia como ponto de partida em vez de começar cru.
 */
export const seedBrandFromMindTemplate = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const [{ MIND_BRAND_TEMPLATE, MIND_BRAND_BLOCKS, invalidateAgentIdentityCache, invalidateBrandBlocksCache }] =
      await Promise.all([import("@/lib/agent-identity.server")]);

    // 1) Upsert agent_identity — só os 3 campos brand.
    const identityRow = {
      user_id: context.userId,
      workspace_id: context.workspaceId,
      persona: MIND_BRAND_TEMPLATE.persona,
      terminologia_redes: MIND_BRAND_TEMPLATE.terminologia_redes,
      exemplo_disparo: MIND_BRAND_TEMPLATE.exemplo_disparo,
    };
    const { error: idErr } = await context.supabase
      .from("agent_identity")
      .upsert(identityRow, { onConflict: "user_id,workspace_id" });
    if (idErr) throw new Error(`agent_identity: ${idErr.message}`);

    // 2) Update agent_config.brand_blocks (só atualiza se já existe linha).
    const { error: cfgErr, count } = await context.supabase
      .from("agent_config")
      .update({ brand_blocks: MIND_BRAND_BLOCKS as never }, { count: "exact" })
      .eq("user_id", context.userId)
      .eq("workspace_id", context.workspaceId);
    if (cfgErr) throw new Error(`agent_config: ${cfgErr.message}`);

    invalidateAgentIdentityCache(context.userId);
    invalidateBrandBlocksCache(context.userId);

    return {
      ok: true,
      brand_fields: 3,
      brand_blocks: Object.keys(MIND_BRAND_BLOCKS).length,
      agent_config_rows_updated: count ?? 0,
    };
  });