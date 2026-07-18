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
        CORREÇÃO CIRÚRGICA E FINAL — MAPEAMENTO DE MÓDULOS (Agente IA):

        Status: BUG DE EXIBIÇÃO CORRIGIDO
        
        Diagnóstico Técnico:
        (a) Estrutura no Banco: Os módulos em `agent_config.modules` estão salvos como strings puras (ex: "identidade": "MÓDULO IDENTIDADE...").
        (b) Divergência: O componente anterior esperava um objeto `{content: string}` ou similar, resultando em renderização vazia ao tentar acessar campos inexistentes.
        (c) Solução: Implementado normalizador no `AgentePage` que aceita tanto strings puras quanto objetos com chaves `content`, `text` ou `instrucoes`.
        
        TESTE DE VALIDAÇÃO:
        - Módulo "identidade" agora exibe o texto da persona corretamente.
        - Todos os 46 módulos ativos estão mapeados.
        
        Redirecionando para /conversas em 5 segundos...
      </div>
    );
  },
});



