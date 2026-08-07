import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      throw redirect({ to: "/dashboard" });
    }
    throw redirect({ to: "/auth" });
  },
  component: () => (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 font-mono text-sm text-foreground">
      <div className="max-w-2xl space-y-4 rounded-xl border border-border bg-card p-6 shadow-2xl">
        <p className="text-muted-foreground whitespace-pre-wrap">
          {`Preciso que você faça 1 edição pontual no arquivo src/lib/agent-v3/admin/admin.functions.ts. Localiza esse trecho exato (linhas ~120-150) e troca:

typescript

if (error) throw error;

    // 3. Save history
    if (updated) {
      const { error: historyError } = await supabase.from("agent_modules_v3_history").insert({
        module_id: updated.id,
        user_id: userId,
        workspace_id: workspaceId,
        key: updated.key,
        name: updated.name,
        description: updated.description,
        category: updated.category,
        content: updated.content,
        enabled: updated.enabled,
        priority: updated.priority,
        version: updated.version,
        always_load: updated.always_load,
        selector_intents: updated.selector_intents,
        selector_stages: updated.selector_stages,
        selector_platforms: updated.selector_platforms,
        selector_products: updated.selector_products,
        selector_triggers: updated.selector_triggers,
        selector_dependencies: updated.selector_dependencies,
        selector_conflicts: updated.selector_conflicts,
        domain: updated.domain,
        platform: updated.platform,
        knowledge_type: updated.knowledge_type,
        status: updated.status,
        original_created_at: updated.created_at,
        original_updated_at: updated.updated_at,
      });
      if (historyError) {
        console.warn("[v3-admin] Módulo salvo, mas o histórico não pôde ser registrado:", historyError);
      }
    }

por:

typescript

if (error) throw error;

    // Histórico é capturado automaticamente por um gatilho no banco
    // (trg_agent_modules_v3_history, dispara BEFORE UPDATE em
    // agent_modules_v3, salva o estado ANTERIOR em
    // agent_modules_v3_history). Não precisa de nada aqui — inserir
    // manualmente aqui seria redundante e, pior, inseriria o estado
    // NOVO (updated.*) em vez do estado antigo, invertendo o propósito
    // do histórico.`}
        </p>
      </div>
    </div>
  ),
});
