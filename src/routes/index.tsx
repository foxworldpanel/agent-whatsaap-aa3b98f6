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
          {"Mensagem 1:\n\nPreciso que você rode essa migration no Supabase:\n\nsql\n\nCREATE TABLE IF NOT EXISTS funnel_debug_trace (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  msg_id TEXT NOT NULL,\n  phone TEXT,\n  step TEXT NOT NULL,\n  details JSONB,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT now()\n);\n\nCREATE INDEX IF NOT EXISTS idx_funnel_debug_trace_msg_id ON funnel_debug_trace (msg_id);\nCREATE INDEX IF NOT EXISTS idx_funnel_debug_trace_phone ON funnel_debug_trace (phone, created_at DESC);\n\nDepois de confirmar que a migration rodou, me avisa que eu te mando o arquivo de código (é grande, vai por edição pontual, igual sempre fizemos).\n\nTrace funil debug\n\nZIP\u00a0\n\n\n\nClaude é uma IA e pode cometer erros. Por favor, verifique as respostas.\n\nTrace funil debug · ZIP"}
        </p>
      </div>
    </div>
  ),
});
