import { createFileRoute } from "@tanstack/react-router";

// Historical V3 test hook retained as a tombstone so the generated route tree
// remains stable. Direct Agent V3 execution from a public webhook bypasses the
// durable Customer Turn ownership boundary, so this endpoint must never execute
// runtime work even if an old V3_TEST_WEBHOOK_ENABLED environment variable is
// accidentally left enabled. Controlled tests should exercise the durable
// ingress/dispatcher path instead.
export const Route = createFileRoute("/api/public/hooks/v3-test-webhook")({
  server: {
    handlers: {
      POST: async () => new Response("not found", { status: 404 }),
    },
  },
});
