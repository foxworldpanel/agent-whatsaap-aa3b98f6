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
          {`Histórico do CMS (agent_modules_v3_history) configurado com política de user_id.

Ações realizadas:
1. Política de isolamento baseada em user_id (para evitar erros de schema ausente).
2. Função 'log_agent_modules_v3_history' vinculada como SECURITY DEFINER.
3. Trigger automático ativado para todos os UPDATEs na tabela agent_modules_v3.`}
        </p>
      </div>
    </div>
  ),
});
