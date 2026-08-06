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
          {"Preciso que você rode essa query no Supabase e me retorne o resultado completo:\n\nsql\n\nSELECT\n  c.id AS contact_id,\n  c.telefone,\n  c.whatsapp_number_id,\n  n.numero AS numero_conectado,\n  m.body AS mensagem_real_do_cliente,\n  m.sender AS remetente,\n  m.created_at AS mensagem_em,\n  wfr.id AS run_id,\n  wfr.status AS run_status,\n  wfr.fired_at AS run_fired_at\nFROM contacts c\nLEFT JOIN whatsapp_numbers n ON n.id = c.whatsapp_number_id\nLEFT JOIN conversations conv ON conv.contact_id = c.id\nLEFT JOIN messages m ON m.conversation_id = conv.id\nLEFT JOIN welcome_funnel_runs wfr ON wfr.contact_id = c.id\nWHERE c.telefone LIKE '%91947647%'\nORDER BY m.created_at ASC;"}
        </p>
      </div>
    </div>
  ),
});
