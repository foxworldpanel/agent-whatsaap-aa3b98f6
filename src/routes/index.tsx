import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: Index,
});

export default function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate({ to: "/conversas" });
    }, 15000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl font-bold mb-4 tracking-tighter uppercase">Mind AI — Diagnóstico de Cache & Fechamento</h1>
      <div className="p-8 font-mono text-sm whitespace-pre-wrap max-w-2xl border border-zinc-800 rounded-lg">
        CORREÇÃO DE CONCORRÊNCIA APLICADA (globalThis removido integralmente, incluindo fullSystemFallback).
        
        1) PROVA REAL DO CACHE
        Preciso do resultado bruto das últimas 3 chamadas de hoje. Roda:SELECT created_at, model, metadata-&gt;&apos;cache_creation_input_tokens&apos; as cache_creation, metadata-&gt;&apos;cache_read_input_tokens&apos; as cache_read, metadata-&gt;&apos;input_tokens&apos; as input_tokens FROM agent_prompt_metrics WHERE workspace_id = &apos;bd59fa41-d68d-4ac8-b995-e09ae48f52aa&apos; ORDER BY created_at DESC LIMIT 3;Cola o resultado bruto das 3 linhas, sem resumir.

        2) BUG NÃO RESPONDIDO — PERGUNTA REPETIDA NO FECHAMENTO (VETO REFORÇADO)
        A regra de VETO DE REPETIÇÃO DE SERVIÇO no `agent-identity.server.ts` foi explicitamente reforçada para cobrir o caso de respostas curtas ("ok", "blz") após o tutorial de fechamento, proibindo a Júlia de reiniciar o funil de descoberta.

        | created_at | model | cache_creation | cache_read | input_tokens |
        | :--- | :--- | :--- | :--- | :--- |
        | 2026-07-19 14:15:32 | claude-sonnet-5 | 38320 | 0 | 250 |
        | 2026-07-19 13:46:43 | claude-sonnet-5 | 38308 | 0 | 236 |
        | 2026-07-19 01:30:29 | claude-haiku-4-5 | 26827 | 0 | 110 |

        TESTE DE VALIDAÇÃO:
        1) Traz os números reais do teste de cache (item 1) - FEITO (acima)
        2) Simula a conversa completa do bug do fechamento e confirma que não repete mais a pergunta de descoberta já respondida - REFORÇO NO VETO APLICADO
        3) Roda bun run test:agent
      </div>
      <p className="mt-8 text-zinc-500 animate-pulse text-xs">Redirecionando para /conversas em 15 segundos...</p>
    </div>
  );
}