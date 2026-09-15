import type { AgentCustomerTurnMember } from "@/lib/agent-v3/customer-turn.server";

export type CustomerTurnMediaContext = {
  conversationId: string;
  phone: string;
  uazapiUrl: string;
  uazapiToken: string;
  openaiApiKey: string;
  anthropicApiKey: string;
};

async function persistResolvedText(supabaseAdmin:any,member:AgentCustomerTurnMember,text:string):Promise<void>{
  const {data,error}=await supabaseAdmin.from("agent_customer_turn_messages").update({resolved_text:text}).eq("turn_id",member.turn_id).eq("job_id",member.job_id).is("resolved_text",null).select("resolved_text").maybeSingle();
  if(error)throw error;
  if(data?.resolved_text===text)return;
  // A concurrent/uncertain write may already have persisted the same semantic
  // resolution. Read it back before deciding whether this is a real conflict.
  const {data:current,error:readError}=await supabaseAdmin.from("agent_customer_turn_messages").select("resolved_text").eq("turn_id",member.turn_id).eq("job_id",member.job_id).maybeSingle();
  if(readError)throw readError;
  if(current?.resolved_text===text)return;
  if(current?.resolved_text)throw new Error(`Customer Turn member ${member.message_id} resolved text conflict`);
  throw new Error(`Customer Turn member ${member.message_id} resolved text persistence was not confirmed`);
}

export async function resolveCustomerTurnMemberText(
  supabaseAdmin: any,
  member: AgentCustomerTurnMember,
  context: CustomerTurnMediaContext,
): Promise<string> {
  const cached=member.resolved_text?.trim();
  if(cached)return cached;
  if (member.input_kind === "texto") return member.input_text.trim();

  if (member.input_kind === "sticker") {
    return member.input_text.trim() || "[figurinha recebida]";
  }

  const { uazapiResolveInboundMedia } = await import("@/lib/uazapi.server");

  if (member.input_kind === "image") {
    if (!context.anthropicApiKey) throw new Error("Customer Turn image requires Anthropic vision key");
    const downloaded = await uazapiResolveInboundMedia({
      creds: { uazapi_url: context.uazapiUrl, uazapi_token: context.uazapiToken },
      webhookMessageId: member.external_id,
      chatPhone: context.phone,
      mediaKind: "image",
    });
    const media = downloaded.fileURL?.trim() || downloaded.fileData?.trim() || member.audio_url?.trim() || "";
    if (!media) throw new Error(`Customer Turn image ${member.message_id} has no resolvable media`);
    const { processImageV3 } = await import("@/lib/agent-v3/integrations/image-processor.server");
    const description = await processImageV3(media, context.anthropicApiKey, downloaded.mimetype || member.input_mime);
    const caption = member.input_text.trim();
    const text = caption ? `${caption}\n[Imagem: ${description}]` : `[Imagem: ${description}]`;
    const patch: Record<string,string> = { body: text, kind: "texto" };
    if (downloaded.fileURL?.trim()) patch.audio_url = downloaded.fileURL.trim();
    const { error } = await supabaseAdmin.from("messages").update(patch).eq("id", member.message_id);
    if (error) throw error;
    await persistResolvedText(supabaseAdmin,member,text);
    return text;
  }

  if (member.input_kind !== "audio") {
    throw new Error(`Customer Turn media kind ${member.input_kind} is not resolved yet`);
  }
  if (!context.openaiApiKey) throw new Error("Customer Turn audio requires OpenAI transcription key");

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
  await persistResolvedText(supabaseAdmin,member,text);
  return text;
}
