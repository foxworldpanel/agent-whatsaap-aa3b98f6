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
          Preciso que você rode essas 3 consultas no Supabase e me retorne o resultado completo de cada uma, sem resumir:
        </p>
        <div className="relative group">
          <pre className="overflow-x-auto rounded-lg bg-black/50 p-4 text-primary group-hover:bg-black/70 transition-colors">
            {`-- 1. Existe alguma tentativa de run do funil pra esse contato?
SELECT 'RUNS DO FUNIL' AS bloco, id::text, funnel_id::text, status, fired_at::text, updated_at::text, workspace_id::text
FROM welcome_funnel_runs
WHERE contact_id = '37e52a00-5365-4925-b684-a7d5811b0736';

-- 2. A conversa foi criada, e com qual workspace_id?
SELECT 'CONVERSA' AS bloco, id::text, workspace_id::text, created_at::text
FROM conversations
WHERE contact_id = '37e52a00-5365-4925-b684-a7d5811b0736'
ORDER BY created_at DESC
LIMIT 3;

-- 3. Qual foi a mensagem real recebida desse contato (texto exato)?
SELECT 'MENSAGEM' AS bloco, id::text, conteudo, tipo, created_at::text
FROM messages
WHERE conversation_id IN (
  SELECT id FROM conversations WHERE contact_id = '37e52a00-5365-4925-b684-a7d5811b0736'
)
ORDER BY created_at ASC
LIMIT 5;`}
          </pre>
        </div>
      </div>
    </div>
  ),
});
