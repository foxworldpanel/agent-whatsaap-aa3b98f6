import { createFileRoute } from "@tanstack/react-router";

// Rota de debug TEMPORÁRIA — testa APENAS o envio via Uazapi, isolado de
// tudo (webhook, IA, funil, memória, catálogo). Objetivo: descobrir se o
// problema de mensagens não entregues está na camada de envio em si, ou
// em alguma outra parte do sistema.
//
// Uso: POST /api/public/hooks/debug-send-text
// Body: { "number": "5511970116430", "text": "teste", "debugKey": "..." }
//
// Restrito ao número de teste e a uma chave simples, pra não virar uma
// porta aberta de envio arbitrário de WhatsApp.

const ALLOWED_TEST_NUMBER = "5511970116430";
const DEBUG_KEY = "mind-debug-2026-temp";

export const Route = createFileRoute("/api/public/hooks/debug-send-text")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => null) as
            | { number?: string; text?: string; debugKey?: string }
            | null;

          if (!body || body.debugKey !== DEBUG_KEY) {
            return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
          }

          const number = String(body.number || "").replace(/\D/g, "");
          const text = String(body.text || "teste de debug");

          if (number !== ALLOWED_TEST_NUMBER) {
            return new Response(
              JSON.stringify({ error: "só o número de teste é permitido nessa rota de debug" }),
              { status: 400 },
            );
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Usa exatamente a mesma busca de credenciais que o webhook real usa,
          // pegando a instância "Mind - Campanha" (número 5513981770804).
          const { data: num, error: numErr } = await supabaseAdmin
            .from("whatsapp_numbers")
            .select("id, user_id, workspace_id, uazapi_url, uazapi_token")
            .eq("workspace_id", "bd59fa41-d68d-4ac8-b995-e09ae48f52aa")
            .eq("status", "connected")
            .limit(1)
            .maybeSingle();

          if (numErr || !num) {
            return new Response(
              JSON.stringify({ error: "instância não encontrada", numErr }),
              { status: 500 },
            );
          }

          const creds = {
            uazapi_url: (num as any).uazapi_url ?? "",
            uazapi_token: (num as any).uazapi_token ?? "",
          };

          console.log("[DEBUG-SEND] Credenciais resolvidas", {
            uazapi_url: creds.uazapi_url,
            hasToken: Boolean(creds.uazapi_token),
          });

          const { uazapiSendText } = await import("@/lib/uazapi.server");

          const startedAt = Date.now();
          let result: unknown;
          let errorMessage: string | null = null;
          try {
            result = await uazapiSendText(creds as any, number, text);
          } catch (e) {
            errorMessage = e instanceof Error ? e.message : String(e);
          }
          const elapsedMs = Date.now() - startedAt;

          console.log("[DEBUG-SEND] Resultado bruto", {
            number,
            text,
            elapsedMs,
            result,
            errorMessage,
          });

          return new Response(
            JSON.stringify({
              number,
              text,
              elapsedMs,
              result,
              errorMessage,
            }, null, 2),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("[DEBUG-SEND] Erro inesperado", message);
          return new Response(JSON.stringify({ error: message }), { status: 500 });
        }
      },
    },
  },
});
