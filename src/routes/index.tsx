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
        RELATÓRIO DE AUDITORIA DE BANCO (WORKSPACE bd59fa41):

        1) agent_config.brand_blocks -> chave "respostas_padrao":
           ENCONTRADO: "O serviço de plays + ouvintes (...) está TEMPORARIAMENTE DESATIVADO para atualização."
           ENCONTRADO: "(plays, ouvintes, streams e saves temporariamente indisponíveis — não listar)"

        2) agent_identity:
           STATUS: Limpo (0 ocorrências em persona, reconhecimento, regras).

        3) forbidden_rules:
           STATUS: Limpo (0 ocorrências).

        4) Outros campos (agent_config.faqs, instructions, etc):
           STATUS: Limpo (0 ocorrências).

        CONCLUSÃO: A "causa raiz" é a persistência da chave 'respostas_padrao' dentro do JSONB 'brand_blocks'. 
        O agente prioriza este bloco de respostas rápidas sobre a lógica de identidade dinâmica.

        PRÓXIMO PASSO: Limpeza cirúrgica via UPDATE no banco.

        ORCHESTRATOR V1 EXECUTADO: SIM
      </div>
      <p className="mt-8 text-zinc-500 animate-pulse text-xs">Redirecionando para /conversas em 15 segundos...</p>
    </div>
  );
}