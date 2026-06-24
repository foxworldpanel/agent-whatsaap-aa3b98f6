import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listFreeTrials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("free_trials")
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  });