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
          {`Histórico do CMS Ativado (agent_modules_v3_history)

A migration foi processada com as seguintes ações:
1. Permissões de Data API (GRANT) aplicadas à tabela de histórico.
2. RLS ativado com política baseada em 'profiles' (workspace isolation).
3. Função 'log_agent_modules_v3_history' configurada como SECURITY DEFINER.
4. Trigger vinculado à tabela principal para capturar estados anteriores automaticamente em cada UPDATE.`}
        </p>
      </div>
    </div>
  ),
});
