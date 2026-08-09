import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: () => (
    <div className="p-8">
      <h1>Lote 1 de 5 — preciso do resultado completo, sem resumir nenhuma linha, mesmo que fique longo:</h1>
      <pre className="bg-slate-100 p-4 mt-4 rounded">
{`sql

SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'agent_config', 'agent_daily_promo', 'agent_generation_locks',
    'agent_identity', 'agent_logs', 'agent_medias', 'agent_modules_v2',
    'agent_modules_v2_history', 'agent_modules_v3', 'agent_modules_v3_history',
    'agent_playground_messages', 'agent_playground_runs'
  )
ORDER BY table_name, ordinal_position;`}
      </pre>
    </div>
  ),
});