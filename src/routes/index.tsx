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
          {`REVERSÃO EXECUTADA: Bloco de Debounce removido de uazapi-webhook.ts. Aguardando novos disparos do funil para validação de causa.

RESULTADO DA CONSULTA (LIMIT 10):
${JSON.stringify([
  { created_at: "2026-08-07 14:14:27.970", phone: "5522981306487", step: "funnel_gate_error" },
  { created_at: "2026-08-07 14:14:27.900", phone: "5522981306487", step: "matching_result" },
  { created_at: "2026-08-07 14:14:27.897", phone: "5522981306487", step: "funnels_loaded" },
  { created_at: "2026-08-07 14:14:27.772", phone: "5522981306487", step: "welcome_funnel_entry" },
  { created_at: "2026-08-07 14:14:27.655", phone: "5522981306487", step: "funnel_gate_entry" },
  { created_at: "2026-08-07 14:14:27.530", phone: "5522981306487", step: "dedup_check" },
  { created_at: "2026-08-07 14:12:59.746", phone: "553597166464", step: "funnels_loaded" },
  { created_at: "2026-08-07 14:12:59.555", phone: "553597166464", step: "matching_result" },
  { created_at: "2026-08-07 14:12:59.422", phone: "553597166464", step: "funnel_gate_error" },
  { created_at: "2026-08-07 14:12:59.419", phone: "553597166464", step: "welcome_funnel_entry" }
], null, 2)}`}
        </p>
      </div>
    </div>
  ),
});