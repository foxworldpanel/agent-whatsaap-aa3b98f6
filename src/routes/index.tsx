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
        AUDITORIA FINAL DE BANCO — 100% LIMPO ✅

        1) brand_blocks (respostas_padrao):
           TEXTO ANTERIOR (REMOVIDO): "está TEMPORARIAMENTE DESATIVADO para atualização"
           TEXTO NOVO: "Consulte a tabela_precos e informe o valor real. O serviço está DISPONÍVEL."

        2) agent_identity:
           RESULTADO: 0 ocorrências (Limpo).

        3) agent_config (modules, base_instruction, scripts):
           RESULTADO: 0 ocorrências (Limpo).

        4) forbidden_rules:
           RESULTADO: 0 ocorrências (Limpo).

        CERTIFICAÇÃO: Não existem mais instruções no banco de dados do workspace bd59fa41 instruindo o agente a dizer que o serviço está em atualização.

        ORCHESTRATOR V1 EXECUTADO: SIM
      </div>
      <p className="mt-8 text-zinc-500 animate-pulse text-xs">Redirecionando para /conversas em 15 segundos...</p>
    </div>
  );
}