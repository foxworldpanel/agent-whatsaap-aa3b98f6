import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { DEFAULT_MODULES_V3 } from "./default-modules-v3.server";
import { invalidateModulesCache } from "./modules.server";

const CATEGORY_MAP: Record<string, string> = {
  identidade: "Núcleo",
  regras_gerais: "Núcleo",
  comportamento_humano: "Núcleo",
  spotify: "Redes Sociais",
  instagram: "Redes Sociais",
  youtube: "Redes Sociais",
  psicologia_vendas: "Comercial",
  fechamento_vendas: "Comercial",
  suporte: "Suporte"
};

export const seedModulesToDb = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { supabase, userId, workspaceId } = context;

    for (const [key, content] of Object.entries(DEFAULT_MODULES_V3)) {
      const name = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const category = CATEGORY_MAP[key] || "Outros";

      const { error } = await supabase
        .from("agent_modules_v3")
        .upsert({
          user_id: userId,
          workspace_id: workspaceId,
          key,
          name,
          content,
          category,
          priority: 50,
          enabled: true,
          version: 1,
          updated_at: new Date().toISOString()
        }, { onConflict: "workspace_id,key" });

      if (error) {
        console.error(`Error seeding module ${key}:`, error);
        throw error;
      }
    }

    invalidateModulesCache(workspaceId);
    return { ok: true };
  });
