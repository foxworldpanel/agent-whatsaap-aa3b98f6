import { runAgentV3Turn } from "./src/lib/agent-v3/orchestrator.server";
import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function diagnose() {
  const userId = "bd59fa41-a3f2-4917-8654-e758a5c379a2"; 
  const sessionId = "00000000-0000-0000-0000-000000000000";
  const message = "Bom dia";

  try {
    const result = await runAgentV3Turn({
      userId,
      message,
      history: [],
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
      inputKind: "texto"
    });

    console.log("2. Testando agent_playground_messages...");
    const { data: agentMsg, error: agentMsgErr } = await supabaseAdmin
      .from("agent_playground_messages")
      .insert({
        session_id: sessionId,
        role: "assistant",
        content: result.replies.join("\n"),
        sequence: Math.floor(Math.random() * 1000000),
        metadata: {
          temperature: result.temperature,
          confidence: result.confidence,
          intent: result.intent,
          stage: result.stage,
          purchase_probability: result.purchase_probability,
          sentiment: result.sentiment,
          urgency: result.urgency,
          recommended_action: result.recommended_action,
          reasoning: result.reasoning,
          conversation_score: result.conversation_score,
          conversation_feedback: result.conversation_feedback
        }
      })
      .select()
      .single();

    if (agentMsgErr) {
      console.error("ERRO_MESSAGES:", JSON.stringify(agentMsgErr, null, 2));
      return;
    }

    console.log("3. Testando agent_playground_runs...");
    const usage = result.usage || {};
    const insertData = {
      session_id: sessionId,
      message_id: agentMsg.id,
      model: "claude-haiku-4-5",
      selected_modules: result.selectedModules || [],
      system_prompt_chars: JSON.stringify(result.rawPrompt).length,
      history_chars: 2,
      message_chars: message.length,
      response_chars: agentMsg.content.length,
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
      cache_read_input_tokens: usage.cache_read_input_tokens || 0,
      cost_usd: 0.001,
      latency_ms: 100,
      anthropic_request_id: usage.request_id || "test",
      system_prompt_snapshot: JSON.stringify(result.rawPrompt),
      temperature: result.temperature,
      confidence: result.confidence,
      intent: result.intent,
      stage: result.stage,
      purchase_probability: result.purchase_probability,
      sentiment: result.sentiment,
      urgency: result.urgency,
      recommended_action: result.recommended_action,
      reasoning: result.reasoning,
      conversation_score: result.conversation_score,
      conversation_feedback: JSON.stringify(result.conversation_feedback),
      metadata: {
        modules_telemetry: result.modulesTelemetry || [],
        prompt_comparison: result.promptComparison || {}
      }
    };

    const { error: runErr } = await supabaseAdmin.from("agent_playground_runs").insert(insertData);
    if (runErr) {
      console.error("ERRO_RUNS:", JSON.stringify(runErr, null, 2));
    } else {
      console.log("SUCESSO_TOTAL");
    }
  } catch (e: any) {
    console.error("ERRO_FATAL:", e.message);
  }
}

diagnose();
