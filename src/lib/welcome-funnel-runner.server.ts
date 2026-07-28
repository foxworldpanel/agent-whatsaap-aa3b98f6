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

async function currentStatus(
  supabase: any,
  funnelId: string,
  contactId: string,
): Promise<RunStatus | null> {
  const { data, error } = await supabase
    .from("welcome_funnel_runs")
    .select("status")
    .eq("funnel_id", funnelId)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data?.status as RunStatus | undefined) ?? null;
}

async function assertNotPaused(params: {
  supabase: any;
  funnelId: string;
  contactId: string;
}) {
  const status = await currentStatus(params.supabase, params.funnelId, params.contactId);
  if (status === "paused") throw new FunnelPausedError();
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

    const now = new Date().toISOString();
    const { error: progressError } = await supabase
      .from("welcome_funnel_runs")
      .update({
        status: "running",
        last_step: key,
        last_step_index: fixedIndex + 1,
        error_message: null,
        updated_at: now,
      })
      .eq("funnel_id", funnel.id)
      .eq("contact_id", contactId);
    if (progressError) throw new Error(progressError.message);

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

  const completedAt = new Date().toISOString();
  const { error: completionError } = await supabase
    .from("welcome_funnel_runs")
    .update({
      status: "completed",
      completed_at: completedAt,
      error_message: null,
      updated_at: completedAt,
    })
    .eq("funnel_id", funnel.id)
    .eq("contact_id", contactId);
  if (completionError) throw new Error(completionError.message);

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
  const now = new Date().toISOString();

  await params.supabase
    .from("welcome_funnel_runs")
    .update({
      status: "failed",
      error_message: message.slice(0, 1000),
      last_error_at: now,
      updated_at: now,
    })
    .eq("funnel_id", params.funnelId)
    .eq("contact_id", params.contactId);

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
