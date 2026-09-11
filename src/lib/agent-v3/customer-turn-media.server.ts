import type { AgentCustomerTurnMember } from "@/lib/agent-v3/customer-turn.server";

export type CustomerTurnMediaContext = {
  conversationId: string;
  phone: string;
  uazapiUrl: string;
  uazapiToken: string;
  openaiApiKey: string;
};

export async function resolveCustomerTurnMemberText(
  supabaseAdmin: any,
  member: AgentCustomerTurnMember,
  context: CustomerTurnMediaContext,
): Promise<string> {
  if (member.input_kind === "texto") return member.input_text.trim();

  if (member.input_kind !== "audio") {
    throw new Error(`Customer Turn media kind ${member.input_kind} is not resolved yet`);
  }
  if (!context.openaiApiKey) throw new Error("Customer Turn audio requires OpenAI transcription key");

  const { uazapiResolveInboundMedia } = await import("@/lib/uazapi.server");
  const downloaded = await uazapiResolveInboundMedia({
    creds: { uazapi_url: context.uazapiUrl, uazapi_token: context.uazapiToken },
    webhookMessageId: member.external_id,
    chatPhone: context.phone,
    mediaKind: "audio",
    openaiApiKey: context.openaiApiKey,
  });

  const media = downloaded.fileURL?.trim() || downloaded.fileData?.trim() || member.audio_url?.trim() || "";
  let text = downloaded.transcription?.trim() || "";
  if (!text) {
    if (!media) throw new Error(`Customer Turn audio ${member.message_id} has no resolvable media`);
    const { processAudioV3 } = await import("@/lib/agent-v3/integrations/audio-processor.server");
    text = (await processAudioV3(media, context.openaiApiKey))?.trim() || "";
  }
  if (!text) throw new Error(`Customer Turn audio ${member.message_id} produced empty transcription`);

  const patch: Record<string,string> = { body: text, kind: "audio" };
  if (downloaded.fileURL?.trim()) patch.audio_url = downloaded.fileURL.trim();
  const { error } = await supabaseAdmin.from("messages").update(patch).eq("id", member.message_id);
  if (error) throw error;
  return text;
}
