import { createMiddleware } from "@tanstack/react-start";
import { getActiveWorkspaceIdFromStorage } from "@/contexts/workspace-context";

/**
 * Client-side function middleware that attaches the active workspace id to
 * every server function call via the `x-workspace-id` header. The server can
 * then scope RLS / queries to that workspace.
 */
export const attachWorkspaceHeader = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const wsId = getActiveWorkspaceIdFromStorage();
    return next({
      headers: wsId ? { "x-workspace-id": wsId } : {},
    });
  },
);