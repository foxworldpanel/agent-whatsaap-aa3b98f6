import { createMiddleware } from "@tanstack/react-start";
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { resolveWorkspaceId, withWorkspaceHeaderFetch } from "@/lib/workspace-scope.server";

/**
 * Runs AFTER requireSupabaseAuth. Resolves the effective workspace_id
 * (header → default) and rebuilds context.supabase so every PostgREST
 * request forwards `x-workspace-id`, letting RLS policies read it via
 * current_setting('request.headers').
 */
export const withWorkspaceScope = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const headerValue = getRequestHeader("x-workspace-id") ?? null;
    const workspaceId = await resolveWorkspaceId(context.supabase, context.userId, headerValue);

    const req = getRequest();
    const bearer = req?.headers.get("authorization") ?? "";
    const SUPABASE_URL = process.env.MIND_SUPABASE_URL!;
    const SUPABASE_PUBLISHABLE_KEY = process.env.MIND_SUPABASE_PUBLISHABLE_KEY!;

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: {
        fetch: withWorkspaceHeaderFetch(fetch, workspaceId),
        headers: bearer ? { Authorization: bearer } : {},
      },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    return next({
      context: {
        supabase,
        workspaceId,
      },
    });
  });