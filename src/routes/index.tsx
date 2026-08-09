import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      throw redirect({ to: "/dashboard" });
    }
    throw redirect({ to: "/auth" });
  },
  component: () => (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 font-mono text-sm text-foreground">
      <div className="max-w-2xl space-y-4 rounded-xl border border-border bg-card p-6 shadow-2xl">
        <p className="text-muted-foreground whitespace-pre-wrap">
          {`Preciso que você faça 1 edição pontual no arquivo src/routes/api/public/hooks/uazapi-webhook.ts. Localiza esse trecho exato:

typescript

let deferredFunnelMessage: string | null = null;

    // Reações simples não precisam consumir Claude nem gerar "qualquer coisa chama".
    // A mensagem continua salva no CRM, apenas não há resposta automática.
    if (content.kind === "texto" && isReactionOnlyMessage(content.text)) {
      console.log(\`[UAZ-WEBHOOK] [AUDIT] RETORNO: reaction only para msgId \${msgId}\`);
      return new Response("ok (reaction only)");
    }


    // 3.4. FUNNEL GATE GLOBAL

E substitui por:

typescript

let deferredFunnelMessage: string | null = null;

    // Reações simples não precisam consumir Claude nem gerar "qualquer coisa chama".
    // A mensagem continua salva no CRM, apenas não há resposta automática.
    if (content.kind === "texto" && isReactionOnlyMessage(content.text)) {
      console.log(\`[UAZ-WEBHOOK] [AUDIT] RETORNO: reaction only para msgId \${msgId}\`);
      return new Response("ok (reaction only)");
    }

    // DEBOUNCE DE MENSAGENS RÁPIDAS — V2, mais curto e monitorado.
    // Corrige o cliente mandando várias mensagens curtas em sequência
    // (comum no WhatsApp real) e cada uma disparando uma chamada de IA
    // independente, gerando respostas fragmentadas e se contradizendo
    // (achado em auditoria de conversa real, inclusive num caso de
    // cliente já irritado reclamando de entrega — pior cenário possível
    // pra receber mensagens confusas).
    //
    // V1 usava 6s e foi revertida por precaução (risco de timeout numa
    // plataforma serverless — Cloudflare Workers). Essa versão usa só
    // 1.5s: reduz bastante o risco de qualquer limite de tempo (da
    // plataforma ou do provedor do WhatsApp esperando resposta rápida),
    // e ainda pega a maioria das rajadas rápidas reais. Tem rastreamento
    // pra detectar na hora se algo sair errado, em vez de silêncio total
    // como aconteceu na V1.
    if (content.kind === "texto" && conversationId) {
      const DEBOUNCE_MS = 1500;
      const debounceStartedAt = new Date().toISOString();

      traceFunnel(supabaseAdmin, msgId, phoneStr, "debounce_v2_entrada", { debounceMs: DEBOUNCE_MS });

      await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS));

      const { data: newerMsgs, error: newerMsgsErr } = await (supabaseAdmin as any)
        .from("messages")
        .select("id, body, created_at")
        .eq("conversation_id", conversationId)
        .eq("sender", "cliente")
        .gt("created_at", debounceStartedAt)
        .order("created_at", { ascending: true });

      if (newerMsgsErr) {
        console.warn("[DEBOUNCE-V2] Falha ao checar mensagens mais novas (seguindo sem agrupar):", newerMsgsErr);
        traceFunnel(supabaseAdmin, msgId, phoneStr, "debounce_v2_erro", { error: String(newerMsgsErr) });
      } else if (newerMsgs && newerMsgs.length > 0) {
        console.log(\`[DEBOUNCE-V2] msgId \${msgId} abortando — \${newerMsgs.length} mensagem(ns) mais nova(s) chegou(ram) durante a espera.\`);
        traceFunnel(supabaseAdmin, msgId, phoneStr, "debounce_v2_abortado", { mensagensMaisNovas: newerMsgs.length });
        return new Response("ok (debounced v2, newer message will handle)");
      } else {
        const { data: burstMsgs } = await (supabaseAdmin as any)
          .from("messages")
          .select("body, created_at")
          .eq("conversation_id", conversationId)
          .eq("sender", "cliente")
          .gte("created_at", new Date(Date.now() - DEBOUNCE_MS - 1000).toISOString())
          .order("created_at", { ascending: true });

        if (burstMsgs && burstMsgs.length > 1) {
          const textoCombinado = (burstMsgs as any[]).map((m) => String(m.body || "").trim()).filter(Boolean).join("\\n");
          if (textoCombinado) {
            console.log(\`[DEBOUNCE-V2] msgId \${msgId} combinando \${burstMsgs.length} mensagens em uma só.\`);
            traceFunnel(supabaseAdmin, msgId, phoneStr, "debounce_v2_combinado", { quantidade: burstMsgs.length });
            content.text = textoCombinado;
          }
        } else {
          traceFunnel(supabaseAdmin, msgId, phoneStr, "debounce_v2_seguiu_normal", {});
        }
      }
    }

    // 3.4. FUNNEL GATE GLOBAL`}
        </p>
      </div>
    </div>
  ),
});
