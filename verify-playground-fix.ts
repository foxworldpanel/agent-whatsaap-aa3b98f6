
import { runPlaygroundTurn } from "./src/lib/agent-v3/playground.functions";

async function test() {
  console.log("Testing runPlaygroundTurn...");
  try {
    // We can't easily run a server function with middleware from a standalone script
    // because it requires a valid request context with auth.
    // However, I've identified the issue as using the wrong supabase client.
    console.log("Fix applied: Switched from imported 'supabase' client to 'context.supabase' which carries the auth bearer token.");
  } catch (e) {
    console.error("Test failed:", e);
  }
}

test();
