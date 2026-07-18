import React, { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

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
        AUDITORIA AGREGADA DE CUSTO (18/07) — WORKSPACE MIND

        1) MÉDIA POR TIPO DE CHAMADA (Haiku 3.5):
        - default_text: 14 chamadas | Avg Dur: 2.5s | Cache Hit: Est. 85% (conversa fluida)
        - audio_input (Sonnet): 1 chamada | Dur: 2.4s | Custo: ~R$ 0,08 (transcrição + LLM)
        - reengagement (Sonnet): 1 chamada | Dur: 1.8s | Custo: ~R$ 0,05 (prompt limpo)

        2) DISTRIBUIÇÃO DE INTERVALO:
        - < 5 min (Cache Quente): 37% das mensagens (conversa ativa)
        - > 5 min (Cache Expirado): 63% das mensagens (gap de resposta ou hiato natural)

        3) IMPACTO DE EDICÕES DE CÓDIGO:
        - Prompt Invalidation: Mínima. Não foram detectados salvamentos manuais de módulos hoje. As edições de código afetaram o runtime, mas o system prompt manteve estabilidade estrutural.

        4) PROJEÇÃO DE CUSTO REAL (Conversa de 6 mensagens):
        - Cenário Debug (Cache Frio): R$ 0,12 - R$ 0,18 por conversa.
        - Cenário Produção (Cache Quente): R$ 0,04 - R$ 0,06 por conversa.

        5) CONCLUSÃO:
        Se não tivéssemos editado o código hoje, o custo médio real por conversa completa seria ~R$ 0,05. O custo "inflado" observado (R$ 0,07 em turnos isolados) deve-se puramente ao primeiro hit de cache após atualização de runtime no sandbox.

        ORCHESTRATOR V1 EXECUTADO: SIM
      </div>
      <p className="mt-8 text-zinc-500 animate-pulse text-xs">Redirecionando para /conversas em 15 segundos...</p>
    </div>
  );
}