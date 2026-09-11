import type {
  AgentV3RuntimeExecutor,
  AgentV3RuntimeInput,
} from "@/lib/agent-v3/inbound-runtime-contract.server";
import type { AgentV3RuntimeResult } from "@/lib/agent-v3/inbound-runtime-result.server";

let registeredRuntime: AgentV3RuntimeExecutor | null = null;

/**
 * Process-local registration boundary for the Agent V3 effectful runtime.
 *
 * The webhook and durable dispatcher must execute the exact same implementation.
 * Registration is intentionally strict: replacing an already-registered runtime
 * with another function is treated as a programming error instead of silently
 * creating two behavioral versions of Julia in one process.
 */
export function registerAgentV3Runtime(executor: AgentV3RuntimeExecutor): void {
  if (registeredRuntime && registeredRuntime !== executor) {
    throw new Error("Agent V3 runtime already registered with a different executor");
  }
  registeredRuntime = executor;
}

export function hasRegisteredAgentV3Runtime(): boolean {
  return registeredRuntime !== null;
}

export async function executeRegisteredAgentV3Runtime(
  supabaseAdmin: any,
  input: AgentV3RuntimeInput,
): Promise<AgentV3RuntimeResult> {
  const executor = registeredRuntime;
  if (!executor) {
    throw new Error("Agent V3 runtime executor is not registered in this process");
  }
  return await executor(supabaseAdmin, input);
}

/** Test-only reset hook; production code must never swap runtimes dynamically. */
export function resetAgentV3RuntimeRegistrationForTests(): void {
  registeredRuntime = null;
}
