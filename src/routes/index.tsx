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
          {`SELECT 'welcome_funnel_run_events' AS tabela, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'welcome_funnel_run_events'
ORDER BY ordinal_position;

SELECT 'messages' AS tabela, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'messages'
ORDER BY ordinal_position;

SELECT 'flow_action_decisions' AS tabela, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'flow_action_decisions'
ORDER BY ordinal_position;

SELECT 'agent_generation_locks' AS tabela, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'agent_generation_locks'
ORDER BY ordinal_position;`}
        </p>
      </div>
    </div>
  ),
});
