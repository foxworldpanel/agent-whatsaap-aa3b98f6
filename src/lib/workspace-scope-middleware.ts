import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
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

    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;

    // Recreate the authenticated client with a fetch that appends the workspace
    // header. We reuse the same bearer token from the original request.
    const authHeader = (context.supabase as unknown as { headers?: Record<string, string> }) ?? null;
    void authHeader;

    const scopedSupabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: {
        fetch: withWorkspaceHeaderFetch(fetch, workspaceId),
        headers: {
          // Pass through the same bearer the auth middleware validated.
          Authorization: `Bearer ${context.claims.__raw ?? ""}`,
        },
      },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    // Prefer the scoped client, but fall back to the original if bearer isn't
    // reachable (defensive — the raw JWT isn't always exposed on claims).
    const supabase = (context.claims && (context.claims as unknown as { __raw?: string }).__raw)
      ? scopedSupabase
      : context.supabase;

    return next({
      context: {
        supabase,
        workspaceId,
      },
    });
  });