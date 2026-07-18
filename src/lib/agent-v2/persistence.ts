/**
 * Agent Mind V2 - Persistência de Logs
 */

import { supabase } from "@/integrations/supabase/client";
import { AgentV2Log } from "./types";

/**
 * Salva um log estruturado da V2.
 * Esta função deve ser chamada no final do processamento V2 (mesmo em shadow mode).
 */
export async function saveAgentV2Log(workspaceId: string, log: AgentV2Log) {
  // 1. Salva na tabela estruturada de logs V2 (para retenção e debug detalhado)
  const { error: logError } = await supabase
    .from('agent_logs_v2' as any)
    .insert({
      conversation_id: log.v1_comparison ? log.v2_response : null, // Placeholder ou ID real se disponível
      workspace_id: workspaceId,
      current_message: log.received_message,
      state: log.structured_state,
      mode: log.mode,
      network: log.network,
      service: log.service,
      intent: log.intent,
      selected_modules: log.selected_modules,
      selected_tools: log.selected_tools,
      prompt_final: log.final_prompt,
      response_v2: log.v2_response,
      input_tokens: log.input_tokens,
      output_tokens: log.output_tokens,
      estimated_cost: log.estimated_cost,
      model: log.model,
      routing_reason: log.routing_reason,
      duration_ms: log.duration_ms,
      execution_mode: log.mode,
      sent_to_customer: log.sent_to_customer,
    });

  if (logError) {
    console.error('[V2] Erro ao salvar log estruturado:', logError);
  }

  // 2. Salva na tabela de métricas (para dashboard e faturamento)
  const { error: metricsError } = await supabase
    .from('agent_prompt_metrics')
    .insert({
      user_id: null, // Será preenchido pelo trigger de RLS ou deixado nulo se service_role
      model: log.model,
      input_tokens: log.input_tokens,
      output_tokens: log.output_tokens,
      cache_creation_input_tokens: 0, // V2 info
      cache_read_input_tokens: 0, // V2 info
      duration_ms: log.duration_ms,
      est_tokens: log.total_tokens,
      total_chars: log.received_message.length + log.v2_response.length,
      history_count: 0, // V2 info
      active_modules_count: log.selected_modules.length,
      active_module_names: log.selected_modules,
      routing_reason: log.routing_reason,
      // Novos campos Commit 2
      brain_version: log.brain_version,
      execution_mode: log.mode,
      sent_to_customer: log.sent_to_customer,
      network: log.network,
      service: log.service,
      intent: log.intent,
      selected_modules: log.selected_modules,
      selected_tools: log.selected_tools,
      estimated_cost: log.estimated_cost,
    });

  if (metricsError) {
    console.error('[V2] Erro ao salvar métricas:', metricsError);
  }
}
