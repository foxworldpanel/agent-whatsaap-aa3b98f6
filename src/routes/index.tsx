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
          {"REVERSÃO EXECUTADA: Bloco de Debounce removido de uazapi-webhook.ts. Aguardando novos disparos do funil para validação de causa.\n\nRESULTADO DA CONSULTA:\nNenhum registro encontrado para os números solicitados (35971664, 11949875510) na tabela funnel_debug_trace."}
        </p>
      </div>
    </div>
  ),
});