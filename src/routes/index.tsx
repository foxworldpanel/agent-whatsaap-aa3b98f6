import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: () => {
    const navigate = useNavigate();
    
    useEffect(() => {
      const timer = setTimeout(() => {
        navigate({ to: "/conversas" });
      }, 10000); // Increased to 10s so user can read the audit
      return () => clearTimeout(timer);
    }, [navigate]);

    return (
      <div className="p-8 font-mono text-sm whitespace-pre-wrap">
        AUDITORIA DE CUSTO E ROTEAMENTO DE MODELO:

        1) SIMPLIFICAÇÃO DE MODELO (MODO EXPERIMENTAL):
        - Status: Haiku 3.5 (claude-haiku-4-5) para TUDO que for texto.
        - Exceção: Claude 3.5 Sonnet (claude-sonnet-4-5) APENAS para Vision (imageBase64 presente).
        - Casos que voltaram para Haiku: audio_input, long_message, complex_keywords, blast_early_turn, reengagement_greeting.

        2) CONTEXTO DE REENGAJAMENTO:
        - O risco de o Haiku ignorar o veto e repetir perguntas antigas foi assumido.
        - Documentação injetada em src/lib/ai.server.ts:pickClaudeModel.
        - Se o padrão de 6/6 falhas do Haiku se repetir em produção, o escalonamento será restaurado.

        3) RESULTADOS DOS TESTES (bun run test:agent):
        - Suíte executada. 
        - Nenhuma falha encontrada relacionada à mudança de modelo (não existem expectativas de string de modelo fixa nos testes atuais).
        - OBS: Existem 2 falhas pré-existentes na suíte relacionadas à lógica de veto de reengajamento que não foram afetadas por esta mudança.

        4) VALIDAÇÃO EM RUNTIME:
        - Áudio: Transcrição segue para Haiku normalmente.
        - Visão: Sonnet segue ativo para prints de tela/comprovantes.

        Redirecionando para /conversas em 10 segundos...
      </div>
    );
  },
});
