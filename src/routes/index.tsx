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
          {`Sistema de Rollback do CMS ativado no backend.

Adicionadas funções de servidor:
- listV3ModuleHistory: Recupera versões arquivadas do banco.
- rollbackV3Module: Restaura um estado anterior, mantendo a rastreabilidade total.

O gatilho 'trg_agent_modules_v3_history' garante que cada restauração também seja arquivada como uma nova versão, permitindo desfazer o próprio rollback se necessário.`}
        </p>
      </div>
    </div>
  ),
});