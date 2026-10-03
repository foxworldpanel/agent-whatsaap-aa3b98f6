export type AgentAiCredentialsV3 = {
  anthropicApiKey: string;
  openaiApiKey: string;
  elevenlabsApiKey: string;
  elevenlabsVoiceId: string;
};

export async function resolveAgentAiCredentialsV3(params: {
  supabaseAdmin: any;
  userId: string;
  workspaceId: string;
}): Promise<AgentAiCredentialsV3> {
  const { supabaseAdmin, userId, workspaceId } = params;

  const { data: integration, error } = await supabaseAdmin
    .from("integrations")
    .select(
      "anthropic_api_key, openai_api_key, elevenlabs_api_key, elevenlabs_voice_id",
    )
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load AI integrations: ${error.message}`);
  }

  return {
    anthropicApiKey:
      integration?.anthropic_api_key?.trim() ||
      process.env.ANTHROPIC_API_KEY?.trim() ||
      "",
    openaiApiKey:
      integration?.openai_api_key?.trim() ||
      process.env.OPENAI_API_KEY?.trim() ||
      "",
    elevenlabsApiKey:
      integration?.elevenlabs_api_key?.trim() ||
      process.env.ELEVENLABS_API_KEY?.trim() ||
      "",
    elevenlabsVoiceId:
      integration?.elevenlabs_voice_id?.trim() ||
      process.env.ELEVENLABS_VOICE_ID?.trim() ||
      "",
  };
}
