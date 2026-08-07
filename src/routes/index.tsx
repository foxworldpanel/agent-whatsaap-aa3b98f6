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
          {`Aqui está o resultado da query para a tabela agent_modules_v3:

column_name           | data_type                | is_nullable
----------------------|--------------------------|------------
id                    | uuid                     | NO
user_id               | uuid                     | NO
workspace_id          | uuid                     | NO
key                   | text                     | NO
name                  | text                     | NO
description           | text                     | YES
category              | text                     | YES
content               | text                     | NO
enabled               | boolean                  | YES
priority              | integer                  | YES
version               | integer                  | YES
created_at            | timestamp with time zone | YES
updated_at            | timestamp with time zone | YES
always_load           | boolean                  | NO
selector_intents      | ARRAY                    | NO
selector_stages       | ARRAY                    | NO
selector_platforms    | ARRAY                    | NO
selector_products     | ARRAY                    | NO
selector_triggers     | ARRAY                    | NO
selector_dependencies | ARRAY                    | NO
selector_conflicts    | ARRAY                    | NO
domain                | text                     | YES
platform              | text                     | YES
knowledge_type        | text                     | YES
status                | text                     | YES`}
        </p>
      </div>
    </div>
  ),
});
