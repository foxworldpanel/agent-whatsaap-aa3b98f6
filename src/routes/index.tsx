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
          {`Preciso que você rode essa query no Supabase e me retorne o resultado completo:

sql

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'welcome_funnel_runs'
ORDER BY ordinal_position;

RESULTADO DA CONSULTA:
${JSON.stringify([
  { column_name: "funnel_id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "contact_id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "user_id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "fired_at", data_type: "timestamp with time zone", is_nullable: "NO" },
  { column_name: "workspace_id", data_type: "uuid", is_nullable: "YES" }
], null, 2)}`}
        </p>
      </div>
    </div>
  ),
});