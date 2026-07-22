import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";
import { invalidateModulesCache } from "../brain/modules.server";

export const updateV3ModulesOrder = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      orders: z.array(z.object({
        key: z.string(),
        priority: z.number()
      }))
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, workspaceId } = context;

    // Use a single RPC call if possible, or multiple updates
    // For simplicity and since modules are few (usually < 50), we can do individual updates
    // Or a bulk upsert if we have the full rows, but we only want to update priority
    
    for (const item of data.orders) {
      await supabase
        .from("agent_modules_v3")
        .update({ priority: item.priority })
        .eq("workspace_id", workspaceId)
        .eq("key", item.key);
    }

    invalidateModulesCache(workspaceId);
    return { ok: true };
  });
