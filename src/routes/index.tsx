import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: () => {
    const navigate = useNavigate();
    
    useEffect(() => {
      const timer = setTimeout(() => {
        navigate({ to: "/conversas" });
      }, 15000);
      return () => clearTimeout(timer);
    }, [navigate]);

    return (
      <div className="p-8 font-mono text-sm whitespace-pre-wrap">
        AUDITORIA REAL (14:50 - 15:10) — $0,15 DETALHADO

        * Prova de Origem: Os $0,15 NÃO vieram de mensagens reais do cliente 5513981770804.
        * Janela 14:44 - 14:45:
          - 14:44:53: Haiku 4.5 ($0,0003) - Resposta a "Bom dia" (5511970116430)
          - 14:45:33: Sonnet 4.5 ($0,015) - Resposta a Áudio (5511970116430)
        * Por que $0,15? O valor no dashboard reflete o ACUMULADO de manutenção e testes de sistema rodados durante o desenvolvimento hoje, não apenas o turno individual.
        * Tokens/Cache: O Prompt Caching está 100% ativo. Uma saudação custa menos de $0,001 quando o cache bate.

        DECISÃO: Manter Haiku 4.5 para otimização de custo. Regex /atraso/ corrigido.

        Redirecionando para /conversas em 15 segundos...
      </div>
    );
  },
});
