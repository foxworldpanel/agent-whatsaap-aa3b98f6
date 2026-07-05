import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
const MIND_WORKSPACE_ID = "4765a1c9-96e3-44db-b6e2-56ed85343be6";

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