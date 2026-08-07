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
          {"Preciso que você rode essa query no Supabase e me retorne o resultado completo:\n\nsql\n\nSELECT step, details, created_at\nFROM funnel_debug_trace\nWHERE phone LIKE '%21981732021%'\nORDER BY created_at ASC;\nEOF"}
        </p>
      </div>
    </div>
  ),
});