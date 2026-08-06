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
          Preciso que você rode essas 2 consultas no Supabase e me retorne o resultado completo de cada uma:
        </p>
        <div className="relative group">
          <pre className="overflow-x-auto rounded-lg bg-black/50 p-4 text-primary group-hover:bg-black/70 transition-colors">
            {`-- 1. TODOS os contatos com esse telefone (mesmo que dupliquem)
SELECT 'TODOS OS CONTATOS' AS bloco, id::text, telefone, whatsapp_number_id::text, user_id::text, created_at::text
FROM contacts
WHERE telefone LIKE '%98069512%';

-- 2. A conversa que TEM a mensagem "Olá! Tenho interesse..." — qual contact_id ela usa de verdade?
SELECT 'CONVERSA REAL DA MENSAGEM' AS bloco, conv.id::text AS conversation_id, conv.contact_id::text, conv.workspace_id::text, conv.created_at::text
FROM conversations conv
WHERE conv.id IN (
  SELECT conversation_id FROM messages WHERE body LIKE '%Tenho interesse em divulgar%'
);`}
          </pre>
        </div>
      </div>
    </div>
  ),
});
