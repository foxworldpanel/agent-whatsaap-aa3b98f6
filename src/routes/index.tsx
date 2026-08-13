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
    <div className="p-8 font-mono whitespace-pre bg-slate-950 text-slate-50 min-h-screen">
      {`SELECT 'conversations_v3.order_context' AS item,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='conversations_v3' AND column_name='order_context') AS existe
UNION ALL
SELECT 'agent_execution_traces (tabela)',
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='agent_execution_traces')
UNION ALL
SELECT 'free_test_services (tabela)',
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='free_test_services')
UNION ALL
SELECT 'welcome_funnel_runs.funnel_id',
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='welcome_funnel_runs' AND column_name='funnel_id')
UNION ALL
SELECT 'agent_modules_v2 (deve ser FALSE, já apagada)',
  EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='agent_modules_v2');`}
    </div>
  ),
});
