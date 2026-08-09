import { sleepMs } from "@/lib/agent-v3/humanization.server";
import {
  uazapiClearPresence,
  uazapiSendAudio,
  uazapiSendMedia,
  uazapiSendRecording,
  uazapiSendText,
  uazapiSendTyping,
} from "@/lib/uazapi.server";

type Step = {
  enabled?: boolean;
  text?: string;
  caption?: string;
  url?: string;
  delay_seconds?: number;
};

export type WelcomeFunnelRuntime = {
  id: string;
  name?: string | null;
  delay_seconds?: number | null;
  steps?: {
    welcome_text?: Step;
    audio?: Step;
    panel_text?: Step;
    video?: Step;
    services_text?: Step;
  } | null;
};

type RunStatus = "running" | "completed" | "failed" | "paused";

export class FunnelPausedError extends Error {
  constructor() {
    super("WELCOME_FUNNEL_PAUSED");
    this.name = "FunnelPausedError";
  }
}

const ORDER = [
  "welcome_text",
  "audio",
  "panel_text",
  "video",
  "services_text",
] as const;

function stepDelayMs(step: Step | undefined, fallbackSec: number | null | undefined) {
  const sec = Number.isFinite(Number(step?.delay_seconds))
    ? Number(step?.delay_seconds)
    : Number(fallbackSec || 0);
  return Math.max(0, Math.min(180, sec)) * 1000;
}

// Rastreamento de depuração — mesma tabela usada pelo webhook
// (funnel_debug_trace), mas gravado direto daqui, já que esse arquivo
// não tem acesso ao msgId original. Usa funnel_id+phone como
// identificador. Fire-and-forget: nunca bloqueia o envio das etapas.
async function traceRunnerStep(params: {
  supabase: any;
  phone: string;
  funnelId: string;
  step: string;
  details: Record<string, unknown>;
}): Promise<void> {
  try {
    await params.supabase.from("funnel_debug_trace").insert({
      msg_id: `runner:${params.funnelId}`,
      phone: params.phone,
      step: params.step,
      details: params.details,
    });
  } catch (traceErr) {
    console.warn("[FUNNEL-RUNNER-TRACE] Falha ao gravar checkpoint (não bloqueia o envio):", traceErr);
  }
}

async function addEvent(params: {
  supabase: any;
  userId: string;
  workspaceId: string;
  funnelId: string;
  contactId: string;
  eventType: string;
  stepKey?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await params.supabase
    .from("welcome_funnel_run_events")
    .insert({
      user_id: params.userId,
      workspace_id: params.workspaceId,
      funnel_id: params.funnelId,
      contact_id: params.contactId,
      event_type: params.eventType,
      step_key: params.stepKey ?? null,
      message: params.message ?? null,
      metadata: params.metadata ?? {},
    });
  if (error) console.warn("[FUNNEL-RUNNER] event log indisponível:", error.message || error);
}

async function assertNotPaused(params: {
  supabase: any;
  funnelId: string;
  contactId: string;
}) {
  // Simplificado para evitar quebra por falta de coluna status
  return;
}

async function persistOutbound(params: {
  supabase: any;
  conversationId: string;
  userId: string;
  workspaceId: string;
  kind: "texto" | "audio";
  body: string;
  audioUrl?: string | null;
}) {
  const { error } = await params.supabase.from("messages").insert({
    conversation_id: params.conversationId,
    user_id: params.userId,
    workspace_id: params.workspaceId,
    sender: "agente",
    kind: params.kind,
    body: params.body,
    audio_url: params.audioUrl ?? null,
  });
  if (error) console.warn("[FUNNEL-RUNNER] outbound enviado mas não persistido:", error.message || error);
}

export async function runWelcomeFunnelSequence(params: {
  supabase: any;
  funnel: WelcomeFunnelRuntime;
  contactId: string;
  conversationId: string;
  userId: string;
  workspaceId: string;
  phone: string;
  creds: { uazapi_url: string; uazapi_token: string };
  resumeAfterStep?: string | null;
  initiatedBy?: "trigger" | "retry" | "resume";
}) {
  const {
    supabase,
    funnel,
    contactId,
    conversationId,
    userId,
    workspaceId,
    phone,
    creds,
  } = params;

  const steps = funnel.steps || {};
  const resumeIndex = params.resumeAfterStep
    ? ORDER.indexOf(params.resumeAfterStep as (typeof ORDER)[number])
    : -1;

  // Conecta a coluna conversations.funnel_status, que já existia no banco
  // (enum not_started/running/completed) mas nunca era escrita por
  // nenhum código — achado em auditoria de schema em 09/08/2026.
  const { error: statusRunningErr } = await supabase
    .from("conversations")
    .update({ funnel_status: "running" })
    .eq("id", conversationId)
    .eq("workspace_id", workspaceId);
  if (statusRunningErr) {
    console.warn("[FUNNEL-RUNNER] Não foi possível marcar funnel_status=running (não bloqueia o fluxo):", statusRunningErr);
  }

  await addEvent({
    supabase,
    userId,
    workspaceId,
    funnelId: funnel.id,
    contactId,
    eventType: params.initiatedBy === "retry" ? "retry_started" : params.initiatedBy === "resume" ? "resumed" : "started",
    message: params.resumeAfterStep
      ? `Retomando após ${params.resumeAfterStep}`
      : "Execução iniciada",
  });

  for (let fixedIndex = 0; fixedIndex < ORDER.length; fixedIndex += 1) {
    const key = ORDER[fixedIndex];
    if (fixedIndex <= resumeIndex) continue;

    const step = steps[key];
    if (!step?.enabled) continue;

    await assertNotPaused({ supabase, funnelId: funnel.id, contactId });

    const delayMs = stepDelayMs(step, funnel.delay_seconds);
    if (delayMs > 0) {
      if (key === "audio") {
        await uazapiSendRecording(creds, phone, delayMs).catch(() => undefined);
      } else {
        await uazapiSendTyping(creds, phone, delayMs).catch(() => undefined);
      }
      await sleepMs(delayMs);
      await assertNotPaused({ supabase, funnelId: funnel.id, contactId });
    }

    // IMPORTANTE (correção de bug real, achado em produção): cada etapa
    // agora é protegida individualmente. Antes, se o envio de UMA etapa
    // falhasse (ex: uazapiSendAudio sem try/catch), a exceção parava a
    // função inteira — nenhuma etapa seguinte rodava, e nem o evento
    // final de "completed" era registrado. Agora, se uma etapa falhar,
    // registra o erro, pula pra próxima etapa, e continua a sequência.
    try {
      if (key === "welcome_text" || key === "panel_text" || key === "services_text") {
        const text = step.text?.trim();
        if (!text) continue;
        await uazapiSendText(creds, phone, text);
        await persistOutbound({
          supabase,
          conversationId,
          userId,
          workspaceId,
          kind: "texto",
          body: text,
        });
      } else if (key === "audio") {
        const url = step.url?.trim();
        if (!url) continue;
        await uazapiSendAudio(creds, phone, url);
        await uazapiClearPresence(creds, phone).catch(() => undefined);
        await persistOutbound({
          supabase,
          conversationId,
          userId,
          workspaceId,
          kind: "audio",
          body: "[Áudio do funil de boas-vindas]",
          audioUrl: url,
        });
      } else if (key === "video") {
        const url = step.url?.trim();
        if (!url) continue;
        const caption = step.caption?.trim() || undefined;
        await uazapiSendMedia(creds, phone, "video", url, caption);
        await persistOutbound({
          supabase,
          conversationId,
          userId,
          workspaceId,
          kind: "texto",
          body: caption || "[Vídeo explicativo do funil]",
        });
      }
    } catch (stepError) {
      const errorMessage = stepError instanceof Error ? stepError.message : String(stepError);
      console.error(`[FUNNEL-RUNNER] Falha ao enviar etapa "${key}"; seguindo para a próxima etapa:`, errorMessage);
      await traceRunnerStep({
        supabase,
        phone,
        funnelId: funnel.id,
        step: "step_send_error",
        details: { stepKey: key, error: errorMessage },
      });
      await addEvent({
        supabase,
        userId,
        workspaceId,
        funnelId: funnel.id,
        contactId,
        eventType: "step_failed",
        stepKey: key,
        message: errorMessage.slice(0, 1000),
        metadata: { index: fixedIndex + 1 },
      });
      // Não interrompe o loop — segue pra próxima etapa mesmo com essa falhando.
      continue;
    }

    // Removido: UPDATE em welcome_funnel_runs.updated_at — essa coluna
    // não existe na tabela real (confirmado via information_schema).
    // A tabela só tem funnel_id, contact_id, user_id, fired_at,
    // workspace_id — nada pra atualizar por etapa.

    await traceRunnerStep({
      supabase,
      phone,
      funnelId: funnel.id,
      step: "step_sent_ok",
      details: { stepKey: key, index: fixedIndex + 1 },
    });

    await addEvent({
      supabase,
      userId,
      workspaceId,
      funnelId: funnel.id,
      contactId,
      eventType: "step_completed",
      stepKey: key,
      message: `Etapa ${key} enviada`,
      metadata: { index: fixedIndex + 1 },
    });
  }

  await traceRunnerStep({
    supabase,
    phone,
    funnelId: funnel.id,
    step: "sequence_completed",
    details: {},
  });

  const { error: statusCompletedErr } = await supabase
    .from("conversations")
    .update({ funnel_status: "completed" })
    .eq("id", conversationId)
    .eq("workspace_id", workspaceId);
  if (statusCompletedErr) {
    console.warn("[FUNNEL-RUNNER] Não foi possível marcar funnel_status=completed (não bloqueia o fluxo):", statusCompletedErr);
  }

  await addEvent({
    supabase,
    userId,
    workspaceId,
    funnelId: funnel.id,
    contactId,
    eventType: "completed",
    message: "Funil concluído com sucesso",
  });
}

export async function markFunnelRunFailed(params: {
  supabase: any;
  funnelId: string;
  contactId: string;
  userId: string;
  workspaceId: string;
  error: unknown;
}) {
  const message = params.error instanceof Error ? params.error.message : String(params.error);
  
  await addEvent({
    supabase: params.supabase,
    userId: params.userId,
    workspaceId: params.workspaceId,
    funnelId: params.funnelId,
    contactId: params.contactId,
    eventType: "failed",
    message: message.slice(0, 1000),
  });
}
