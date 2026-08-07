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
          {`Preciso que você rode essa query no Supabase e me retorne o resultado completo, sem resumir:

sql

SELECT phone, step, details, created_at
FROM funnel_debug_trace
WHERE phone LIKE '%15997918744%'
   OR phone LIKE '%21980837957%'
ORDER BY phone, created_at ASC;`}
        </p>
      </div>
    </div>
  ),
});