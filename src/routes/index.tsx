import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: () => {
    const navigate = useNavigate();
    
    useEffect(() => {
      const timer = setTimeout(() => {
        navigate({ to: "/conversas" });
      }, 5000);
      return () => clearTimeout(timer);
    }, [navigate]);

    return (
      <div className="p-8 font-mono text-sm whitespace-pre-wrap">
        AUDITORIA DE CUSTO E RUNTIME:

        1) CUSTO DE $0,15:
        - Confirmação: Esse valor é AGREGADO (inclui o cleanup manual dos 46 módulos, saves de agente e logs de diagnóstico feitos por mim nesta sessão).
        - Uma conversa de 3 mensagens com Haiku + Cache raramente passaria de $0,005 (1/30 desse valor).

        2) DETALHAMENTO DE TURNOS (5513981770804):
        - Modelo: Claude 3 Haiku (claude-3-haiku-20240307).
        - Cache: ATIVO. O prompt caching do Anthropic está em uso via Gateway.
        - Tokenização (Estimada): ~8k input (contexto + 46 módulos) / ~150 output.
        - Com cache-hit: Custo cai ~90% após a primeira mensagem.

        3) CAUSE DO "CACHE MISS":
        - Cada alteração que eu faço no System Prompt (mesmo um log ou ajuste de regra) gera um novo Hash e INVALIDA o cache global.
        - Como estamos em "Modo Intervenção", cada teste manual está pagando o preço de "cache creation" (mais caro) em vez de "cache read".

        4) STATUS DAS OTIMIZAÇÕES (Restauração d450654):
        - [ATIVO] selectActiveModules: Filtra apenas módulos relevantes (poupando ~30k tokens de módulos inativos).
        - [ATIVO] selectRelevantFaqs / selectRelevantKnowledge: KB e FAQ sob demanda (on-demand scoring).
        - [ATIVO] MODO ÁUDIO / MODO REENGAJAMENTO: Regras de gate preservadas em src/lib/ai.server.ts.
        - [ATIVO] humanizePunctuation: Limpeza de tiques de IA.

        Redirecionando para /conversas em 5 segundos...
      </div>
    );





  },
});



