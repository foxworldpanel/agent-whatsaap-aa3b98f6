// Wrapper centralizado de envio de texto do agente, aplicando os MESMOS
// guards do fluxo principal do Claude a TODOS os caminhos canned de
// resposta (funil de boas-vindas, teste grátis, verbose-loop farewell,
// playlist-sales, etc.).
//
// Guards aplicados aqui (categoria "presentation" — valem pra qualquer
// texto do agente, canned ou LLM):
//   - limitEmojiFrequency  → nunca 2 mensagens seguidas com emoji
//   - humanizePunctuation  → remove en/em-dash típicos de LLM (opt-in)
//
// NÃO entram aqui (categoria "LLM-only" — só faz sentido pra texto do
// Claude, canned não precisa):
//   - sanitizeSystemLeaks  → só o LLM pode ecoar bloco de sistema
//   - enforceReengagementGreeting → só faz sentido quando o modo
//     REENGAJAMENTO está ativo, que só existe no fluxo Claude
//
// O helper busca as últimas 3 mensagens do agente na conversa direto do
// DB via supabaseAdmin (uma query barata). Isso garante que o histórico
// usado pela trava de emoji inclui TODAS as mensagens enviadas antes,
// independente de qual caminho as gerou.

import { limitEmojiFrequency } from "@/lib/emoji-limiter";
import { humanizePunctuationV3 } from "@/lib/agent-v3/brain/guards.server";

type UazapiCreds = Parameters<typeof import("@/lib/uazapi.server").uazapiSendText>[0];

export interface SendAgentTextGuardedOptions {
  conversationId: string;
  // Origem pra logs (welcome_funnel, free_trial_success, verbose_loop_farewell, etc).
  source: string;
  // Ignora limitEmojiFrequency (raro — só pra abertura de disparo).
  isBlastOpening?: boolean;
  // Aplica humanizePunctuation (default false — texto canned foi digitado
  // pelo humano; só ligar quando a origem é LLM).
  applyHumanize?: boolean;
  // Sobrescreve o histórico buscado do DB (útil pra testes).
  recentAgentBodiesOverride?: string[];
  // Janela do limitEmojiFrequency. Default 3.
  emojiWindow?: number;
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

  await uazapiSendText(creds, phone, out);
  return { transformed: out, original, strippedEmoji };
}