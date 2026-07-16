import { runAgentV2Turn as runV2Turn } from "./agent-v2/orchestrator";
import { getConversationStateRepositoryV2 } from "./agent-v2/conversation-state.server";
import { createInitialConversationStateV2 } from "./agent-v2/conversation-state";
import { AgentV2E2EInput, AgentV2E2EOutput } from "./agent-v2/orchestrator.types";

/**
 * Execute a turn of the Agent Mind V2 architecture
 * This is a server-only function used by the webhook, NOT a createServerFn
 * to avoid auth middleware issues in webhook context.
 */
export async function runAgentV2Turn(data: {
  conversationId: string;
  workspaceId: string;
  phoneNumber: string;
  currentMessage: string;
  mode?: 'receptive' | 'outbound';
  executionMode?: 'isolated' | 'shadow' | 'real';
  media?: {
    type: 'text' | 'image' | 'audio';
    hasImage?: boolean;
    hasAudio?: boolean;
  };
  shortHistory?: { sender: 'agente' | 'cliente'; body: string }[];
  historySummary?: string;
  toolFixtures?: Record<string, any>;
}): Promise<AgentV2E2EOutput> {
  const repository = getConversationStateRepositoryV2();
  
  // 1. Get or create state
  let state = await repository.get(data.conversationId);
  if (!state) {
    state = createInitialConversationStateV2({
      conversationId: data.conversationId,
      workspaceId: data.workspaceId,
      phoneNumber: data.phoneNumber
    });
  }

  // 2. Run turn
  const output = await runV2Turn({
    workspaceId: data.workspaceId,
    conversationId: data.conversationId,
    phoneNumber: data.phoneNumber,
    currentMessage: data.currentMessage,
    previousState: state,
    mode: data.mode || 'receptive',
    media: data.media,
    shortHistory: data.shortHistory || [],
    historySummary: data.historySummary,
    toolFixtures: data.toolFixtures || {},
    executionMode: data.executionMode || 'real',
  });

  // 3. Save state if real
  if (data.executionMode === 'real') {
    await repository.save(output.stateAfter);
  }

  return output;
}

