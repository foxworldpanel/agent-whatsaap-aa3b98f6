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
          {`Substituí completamente o arquivo src/lib/funnel-control.functions.ts com a nova versão compatível com o schema simplificado de 5 colunas da tabela welcome_funnel_runs. As funções agora tratam a existência de um registro como "concluído" (já disparado) e as operações de pausar ou filtrar por erro foram desativadas ou retornam mensagens informativas, evitando os erros de coluna inexistente.`}
        </p>
      </div>
    </div>
  ),
});