// src/lib/agent-v3/router.server.ts
import { processAudioV3 } from "./integrations/audio-processor.server";
import { runAgentV3Turn } from "./orchestrator.server";

type RouterInput = {
  userId: string;
  workspaceId?: string;
  conversationId?: string;
  phone?: string;
  kind: "texto" | "audio" | "image";
  message: string;
  mediaUrl?: string;
  history: Array<{ sender: "agente" | "cliente"; body: string }>;
  enabledModules: string[];
  customModules: Record<string, string>;
  anthropicApiKey?: string;
  openaiApiKey?: string;
};

export async function routeAgentV3Request(input: RouterInput) {
  let finalMessage = input.message;

  // 1. Handle Audio
  if (input.kind === "audio" && input.mediaUrl) {
    finalMessage = await processAudioV3(input.mediaUrl, input.openaiApiKey);
  }

  // 2. Handle Image (Stub for now, keeping V3 lightweight)
  if (input.kind === "image") {
    // In V3, images could trigger a specific "Image Analysis" module or just be noted
    finalMessage = `${finalMessage}\n[CONTEXTO: O cliente enviou uma imagem/print que deve ser analisada se o histórico sugerir erro ou suporte]`.trim();
  }

  // Convert history format to Orchestrator format
  const formattedHistory: Array<{ role: "agent" | "customer"; content: string }> = input.history.map(m => ({
    role: m.sender === "agente" ? "agent" : "customer",
    content: m.body
  }));

  const { deriveBusinessDecisionV3 } = await import("./brain/business-state.server");
  const decision = deriveBusinessDecisionV3({
    message: finalMessage,
    recentCustomerMessages: formattedHistory.filter(h => h.role === "customer").map(h => h.content)
  });

  // 3. Run Turn
  return await runAgentV3Turn({
    userId: input.userId,
    message: finalMessage,
    history: formattedHistory,
    enabledModules: input.enabledModules,
    customModules: input.customModules,
    anthropicApiKey: input.anthropicApiKey || "",
    workspaceId: input.workspaceId ?? "",
    conversationId: input.conversationId,
    phone: input.phone,
    businessDecision: decision,
    inputKind: input.kind === "image" ? "image" : input.kind === "audio" ? "audio" : "texto"
  });
}
