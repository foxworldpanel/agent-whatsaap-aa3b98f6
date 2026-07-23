import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";
import { invalidateModulesCache } from "../brain/modules.server";

export const updateV3ModulesOrder = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      orders: z.array(z.object({
        key: z.string().trim().min(1).max(120),
        priority: z.number().finite()
      })).min(1).max(200)
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, workspaceId } = context;

    const normalizedOrders = data.orders.map((item) => ({
      key: item.key.trim().toLowerCase(),
      priority: item.priority,
    }));

    const uniqueKeys = new Set(normalizedOrders.map((item) => item.key));
    if (uniqueKeys.size !== normalizedOrders.length) {
      throw new Error("A ordenação contém módulos duplicados");
    }

    for (const item of normalizedOrders) {
      const { error } = await supabase
        .from("agent_modules_v3")
        .update({ priority: item.priority })
        .eq("workspace_id", workspaceId)
        .eq("key", item.key);

      if (error) {
        throw new Error(`[v3-admin] Falha ao atualizar prioridade de ${item.key}: ${error.message}`);
      }
    }

    invalidateModulesCache(workspaceId);
    return { ok: true };
  });
