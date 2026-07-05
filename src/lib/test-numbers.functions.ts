import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";

const normPhone = (p: string) => p.replace(/\D+/g, "");

export const listTestNumbers = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("test_numbers")
      .select("id, phone, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addTestNumber = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({ phone: z.string().min(6).max(30) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const phone = normPhone(data.phone);
    if (phone.length < 8) throw new Error("Número inválido");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("test_numbers")
      .upsert({ user_id: context.userId, phone }, { onConflict: "user_id,phone" });
    if (error) throw new Error(error.message);
    return { ok: true, phone };
  });

export const removeTestNumber = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("test_numbers")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
