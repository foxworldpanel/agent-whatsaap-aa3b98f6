// Central outbound text guard. Presentation rules belong here so every text
// path (LLM and canned/router replies) receives the same WhatsApp-safe shape.

import { limitEmojiFrequency } from "@/lib/emoji-limiter";
import { splitMindPanelUrlPartsV3 } from "@/lib/agent-v3/core/commercial-response-guards.server";
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

export function formatCommercialPricesVerticallyV3(text: string): string {
  let out = String(text || "");
  if (!/R\$\s*\d/i.test(out)) return out;

  // Never leave punctuation stranded after moving a priced offer to its own block.
  out = out.replace(
    /(R\$\s*\d+(?:[.,]\d{1,2})?(?:[ \t]+por[ \t]+\d[\d.]*)?)[ \t]*[.!?][ \t]+(?=\p{L})/giu,
    "$1\n\n",
  );

  // If the model continues directly with a CTA after the price, split it too.
  out = out.replace(
    /(R\$\s*\d+(?:[.,]\d{1,2})?)[ \t]+(?=(?:qual|quantos?|quantas?|quer|deseja|confirma|confirmar|posso|podemos|vai|vamos|me diz|me fala)\b)/giu,
    "$1\n\n",
  );

  // When a priced offer starts after a completed sentence, start it in a new block.
  out = out.replace(
    /([.!?])[ \t]+(?=(?:\d[\d.]*\s*)?(?:plays(?:\s*\+\s*ouvintes)?|ouvintes|seguidores|saves|curtidas|visualiza(?:ç|c)(?:ões|oes)|views|inscritos|comentários|comentarios|reposts?|stories)\b[^\n]*?R\$\s*\d)/giu,
    "$1\n\n",
  );

  // Claude may introduce an offer in prose and put the quantity/price after a colon,
  // e.g. "A gente tem o pacote Plays + Ouvintes: 1.000 = R$ 15,00".
  // Keep the introduction, but move the authoritative quantity/price to its own block.
  // This is generic for any commercial sentence containing R$, not tied to Spotify.
  out = out.replace(
    /([^\n:]+):[ \t]+(?=(?:\d[\d.]*\s*(?:[\p{L}+]+(?:[ \t]+[\p{L}+]+){0,5})?[ \t]*(?:=|-|–|:)?[ \t]*R\$\s*\d))/giu,
    "$1:\n\n",
  );

  return out;
}

export function normalizeAgentTextPresentation(text: string): string {
  let out = stripMarkdownFormattingV3(text ?? "");
  out = formatCommercialPricesVerticallyV3(out);
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

export function finalizeAgentText(
  text: string,
  opts: {
    applyHumanize?: boolean;
    recentAgentBodies?: string[];
    emojiWindow?: number;
    isBlastOpening?: boolean;
  } = {},
): { transformed: string; original: string; strippedEmoji: boolean } {
  let out = text ?? "";
  const original = out;
  if (opts.applyHumanize) out = humanizePunctuationV3(out);
  out = normalizeAgentTextPresentation(out);

  if (!out) {
    return { transformed: "", original, strippedEmoji: false };
  }

  const beforeEmoji = out;
  out = limitEmojiFrequency(out, {
    recentAgentBodies: opts.recentAgentBodies ?? [],
    window: opts.emojiWindow ?? 3,
    isBlastOpening: opts.isBlastOpening,
  });
  return { transformed: out, original, strippedEmoji: beforeEmoji !== out };
}

export function finalizeAgentReplyParts(
  parts: string[],
  opts: {
    applyHumanize?: boolean;
    recentAgentBodies?: string[];
    emojiWindow?: number;
    isBlastOpening?: boolean;
  } = {},
): string[] {
  const finalizedParts: string[] = [];
  for (const part of parts) {
    for (const safePart of splitMindPanelUrlPartsV3(part)) {
      const finalized = finalizeAgentText(safePart, {
        ...opts,
        recentAgentBodies: [
          ...(opts.recentAgentBodies ?? []),
          ...finalizedParts,
        ].slice(-(opts.emojiWindow ?? 3)),
      });
      if (finalized.transformed) finalizedParts.push(finalized.transformed);
    }
  }
  return finalizedParts;
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

  const finalized = finalizeAgentText(text, {
    applyHumanize: opts.applyHumanize,
    recentAgentBodies: recent,
    emojiWindow: opts.emojiWindow,
    isBlastOpening: opts.isBlastOpening,
  });
  const { original, strippedEmoji } = finalized;
  const out = finalized.transformed;

  if (!out) {
    throw new Error(`[send-agent-guarded] resposta vazia após normalização (${opts.source})`);
  }

  const beforeEmoji = normalizeAgentTextPresentation(
    opts.applyHumanize ? humanizePunctuationV3(text ?? "") : (text ?? ""),
  );
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