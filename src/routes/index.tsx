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
          Preciso que você rode essa query no Supabase e me retorne o resultado completo:
        </p>
        <div className="relative group">
          <pre className="overflow-x-auto rounded-lg bg-black/50 p-4 text-primary group-hover:bg-black/70 transition-colors">
            {`SELECT
  c.id AS contact_id,
  c.telefone,
  c.whatsapp_number_id,
  n.numero AS numero_conectado,
  c.created_at AS contato_criado_em
FROM contacts c
LEFT JOIN whatsapp_numbers n ON n.id = c.whatsapp_number_id
WHERE c.telefone LIKE '%98069512%'
ORDER BY c.created_at DESC;`}
          </pre>
        </div>
      </div>
    </div>
  ),
});
