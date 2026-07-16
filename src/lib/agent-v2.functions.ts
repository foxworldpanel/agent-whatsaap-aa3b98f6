import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";
import { z } from "zod";
import { runAgentV2Turn as runV2Turn } from "./agent-v2/orchestrator";
import { getConversationStateRepositoryV2 } from "./agent-v2/conversation-state.server";
import { createInitialConversationStateV2 } from "./agent-v2/conversation-state";

/**
 * Execute a turn of the Agent Mind V2 architecture
 */
export const runAgentV2Turn = createServerFn({ method: "POST" })
  .middleware([withWorkspaceScope])
  .inputValidator((d: unknown) =>
    z.object({
      conversationId: z.string().uuid(),
      workspaceId: z.string().uuid(),
      phoneNumber: z.string(),
      currentMessage: z.string(),
      mode: z.enum(['receptive', 'outbound']).optional().default('receptive'),
      executionMode: z.enum(['isolated', 'shadow', 'real']).optional().default('real'),
      media: z.object({
        type: z.enum(['text', 'image', 'audio']),
        hasImage: z.boolean().optional(),
        hasAudio: z.boolean().optional(),
      }).optional(),
      shortHistory: z.array(z.object({
        sender: z.enum(['agente', 'cliente']),
        body: z.string(),
      })).optional().default([]),
      historySummary: z.string().optional(),
      toolFixtures: z.record(z.string(), z.any()).optional().default({}),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
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
      mode: data.mode,
      media: data.media,
      shortHistory: data.shortHistory,
      historySummary: data.historySummary,
      toolFixtures: data.toolFixtures,
      executionMode: data.executionMode,
    });

    // 3. Save state if real
    if (data.executionMode === 'real') {
      await repository.save(output.stateAfter);
    }

    return output;
  });
