// Central outbound text guard. Presentation rules belong here so every text
// path (LLM and canned/router replies) receives the same WhatsApp-safe shape.

import { limitEmojiFrequency } from "@/lib/emoji-limiter";
import {
  humanizePunctuationV3,
  stripMarkdownFormattingV3,
} from "@/lib/agent-v3/brain/guards.server";

type UazapiCreds = Parameters<typeof import("@/lib/uazapi.server").uazapiSendText>[0];

export interface SendAgentTextGuardedOptions {
  conversationId: string;
  source: string;
  isBlastOpening?: boolean;
  applyHumanize?: boolean;
  recentAgentBodiesOverride?: string[];
  emojiWindow?: number;
}

function normalizeWhatsAppPresentation(text: string): string {
  let out = stripMarkdownFormattingV3(text ?? "");
  out = out
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Modelos às vezes repetem a mesma pergunta como CTA em duas linhas.
  // Remove somente duplicatas exatas consecutivas, sem resumir conteúdo.
  const paragraphs = out.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const deduped: string[] = [];
  for (const paragraph of paragraphs) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.toLocaleLowerCase("pt-BR") === paragraph.toLocaleLowerCase("pt-BR")) continue;
    deduped.push(paragraph);
  }
  return deduped.join("\n\n").trim();
}

export async function sendAgentTextGuarded(
  creds: UazapiCreds,
  phone: string,
  text: string,
  opts: SendAgentTextGuardedOptions,
): Promise<{ transformed: string; original: string; strippedEmoji: boolean }> {
  const { uazapiSendText } = await import("@/lib/uazapi.server");

  let recent = opts.recentAgentBodiesOverride;
  if (!recent) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("messages")
        .select("body")
        .eq("conversation_id", opts.conversationId)
        .eq("sender", "agente")
        .order("created_at", { ascending: false })
        .limit(opts.emojiWindow ?? 3);
      recent = ((data ?? []) as Array<{ body: string | null }>)
        .map((r) => r.body ?? "")
        .reverse();
    } catch (e) {
      console.warn("[send-agent-guarded] failed to load recent agent bodies", e);
      recent = [];
    }
  }

  let out = text ?? "";
  const original = out;
  if (opts.applyHumanize) out = humanizePunctuationV3(out);
  out = normalizeWhatsAppPresentation(out);

  if (!out) {
    throw new Error(`[send-agent-guarded] resposta vazia após normalização (${opts.source})`);
  }

  const beforeEmoji = out;
  out = limitEmojiFrequency(out, {
    recentAgentBodies: recent,
    window: opts.emojiWindow ?? 3,
    isBlastOpening: opts.isBlastOpening,
  });
  const strippedEmoji = beforeEmoji !== out;
  if (strippedEmoji) {
    console.info("[send-agent-guarded] emoji normalizado", {
      source: opts.source,
      conversationId: opts.conversationId,
      beforePreview: beforeEmoji.slice(0, 80),
      afterPreview: out.slice(0, 80),
    });
  }

  const uazapiRawResult = await uazapiSendText(creds, phone, out);
  console.log("[AUDIT] [UAZAPI-SEND-RAW-RESULT]", {
    phone,
    conversationId: opts.conversationId,
    textPreview: out.slice(0, 80),
    rawResult: uazapiRawResult,
  });
  const failedStatuses = new Set(["failed", "rejected", "error", "invalid", "invalid_recipient"]);
  const statusLower = String(uazapiRawResult?.status || "").toLowerCase();
  if (failedStatuses.has(statusLower)) {
    throw new Error(
      `Uazapi reportou falha no envio (status: ${uazapiRawResult?.status}) pra ${phone}. ` +
      `messageId: ${uazapiRawResult?.messageId ?? "nenhum"}.`,
    );
  }
  return { transformed: out, original, strippedEmoji };
}