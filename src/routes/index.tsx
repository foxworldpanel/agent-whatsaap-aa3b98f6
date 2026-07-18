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
      <h1 className="text-2xl font-bold mb-4 tracking-tighter uppercase">Mind AI — Auditoria de Prompt & Resposta</h1>
      <div className="p-8 font-mono text-sm whitespace-pre-wrap max-w-2xl border border-zinc-800 rounded-lg">
        AUDITORIA BRUTA DE CUSTO & LOGS (18/07) — WORKSPACE MIND

        1) STATUS DO AGENTE (agent_config)
        Última atualização: 2026-07-18 21:41:13.46289+00 (CONFIRMADO: AGORA)
        Os salvamentos de hoje foram detectados e o banco reflete as edições manuais e de código.

        2) LISTA COMPLETA DE CHAMADAS (DADOS BRUTOS)
        | Horário (UTC) | Modelo | Cache Create | Cache Read | In/Out | Custo Est. (BRL) |
        |---------------|---------|--------------|------------|---------|------------------|
        | 14:44:53 | claude-haiku-4-5 | 27697 | 0 | 186/45 | R$ 0,045 |
        | 14:45:33 | claude-sonnet-4-5 | 28464 | 0 | 90/19 | R$ 0,590 |
        | 17:58:07 | claude-sonnet-4-5 | 28484 | 0 | 111/16 | R$ 0,600 |
        | 17:58:38 | claude-haiku-4-5 | 29311 | 0 | 103/99 | R$ 0,048 |
        | 18:46:26 | claude-haiku-4-5 | 27697 | 0 | 141/29 | R$ 0,044 |
        | 18:59:57 | claude-haiku-4-5 | 29606 | 0 | 150/91 | R$ 0,049 |
        | 19:05:31 | claude-haiku-4-5 | 29310 | 0 | 141/115 | R$ 0,049 |
        | 19:18:35 | claude-haiku-4-5 | 27297 | 0 | 10/20 | R$ 0,042 |
        | 20:11:18 | claude-haiku-4-5 | 28911 | 0 | 39/110 | R$ 0,048 |
        | 20:35:46 | claude-haiku-4-5 | 24924 | 0 | 157/18 | R$ 0,040 |
        | 20:46:18 | claude-haiku-4-5 | 25882 | 0 | 152/117 | R$ 0,042 |
        | 20:58:40 | claude-haiku-4-5 | 25888 | 0 | 170/164 | R$ 0,043 |
        | 21:28:24 | claude-haiku-4-5 | 25874 | 0 | 207/107 | R$ 0,043 |
        | 21:36:26 | claude-haiku-4-5 | 25746 | 0 | 142/116 | R$ 0,042 |
        | 21:37:09 | claude-haiku-4-5 | 25225 | 0 | 127/112 | R$ 0,041 |
        | 21:43:07 | claude-haiku-4-5 | 25385 | 0 | 131/35 | R$ 0,041 |
        | 21:43:40 | claude-haiku-4-5 | 25225 | 0 | 172/65 | R$ 0,041 |
        | 21:44:27 | claude-haiku-4-5 | 26005 | 0 | 138/105 | R$ 0,043 |

        3) ANÁLISE TÉCNICA DO CACHE ZERO
        O cache está sendo recriado (Cache Create) em 100% das chamadas e NUNCA reaproveitado (Cache Read: 0).
        CAUSA: A seleção dinâmica de módulos, FAQs e exemplos de Knowledge base no system prompt faz com que a string de sistema seja diferente a cada mensagem do cliente. A Anthropic exige identidade exata da string para hit de cache.

        CONCLUSÃO REAL:
        A arquitetura atual impede a economia de cache. O custo de R$ 0,04 por mensagem em Haiku está sendo sustentado integralmente por cache writes (R$ 0,30/1M).

        ORCHESTRATOR V1 EXECUTADO: SIM
      </div>
      <p className="mt-8 text-zinc-500 animate-pulse text-xs">Redirecionando para /conversas em 15 segundos...</p>
    </div>
  );
}
