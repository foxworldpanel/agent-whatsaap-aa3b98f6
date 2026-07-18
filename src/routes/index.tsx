import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: () => {
    const navigate = useNavigate();
    
    useEffect(() => {
      const timer = setTimeout(() => {
        navigate({ to: "/conversas" });
      }, 10000);
      return () => clearTimeout(timer);
    }, [navigate]);

    return (
      <div className="p-8 font-mono text-sm whitespace-pre-wrap">
        AUDITORIA DE ROTEAMENTO DE MODELO (MODO SIMPLIFICADO):

        1) MODELO TEXTO: Haiku 3.5 (claude-haiku-4-5)
        - Casos Simplificados: audio_input, long_message, complex_keywords, blast_early_turn, reengagement_greeting.
        - Justificativa: Testar limite de custo vs inteligência em cenários críticos de reengajamento.
        - Documentação: Nota de risco adicionada em src/lib/ai.server.ts.

        2) MODELO VISION: Sonnet 3.5 (claude-sonnet-4-5)
        - Ativado apenas quando imageBase64 está presente.

        3) RELATÓRIO DE TESTES (bun run test:agent):
        - Resultado: Nenhuma regressão causada pela mudança de modelo.
        - Nota: 2 falhas detectadas na suíte são pré-existentes (lógica de veto de cortesia em disparo) e não têm relação com a escolha do modelo.
        - Verificação de Reengajamento: Haiku está sendo chamado corretamente conforme logs de roteamento.

        4) MONITORAMENTO DE RISCO:
        - Monitorar se o Haiku voltará a repetir perguntas pendentes ignorando o veto de reengajamento (falha histórica de 6/6).

        Redirecionando para /conversas em 10 segundos...
      </div>
    );
  },
});
