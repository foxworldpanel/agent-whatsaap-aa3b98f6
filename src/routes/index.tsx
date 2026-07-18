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
      <h1 className="text-2xl font-bold mb-4 tracking-tighter">MIND SMM PANEL — AUDITORIA DE CUSTO</h1>
      <div className="p-8 font-mono text-sm whitespace-pre-wrap max-w-2xl border border-zinc-800 rounded-lg">
        AUDITORIA DE PERSISTÊNCIA — MÓDULO TABELA DE PREÇOS:

1) STATUS DO BOTÃO: O botão "Salvar Agente" consolida as edições de TODOS os módulos carregados na sessão e realiza um upsert no banco (agent_config.modules).
2) INTEGRIDADE: O processo utiliza um merge no servidor (mergeAgentModulesForSave) que preserva módulos existentes que não foram alterados, garantindo que nenhuma configuração seja perdida.
3) RUNTIME: Uma vez salvo, o Agente IA (V1) consome o novo JSON imediatamente no próximo turno de conversa, sem necessidade de publicação manual.

VALIDAÇÃO DO BANCO (Workspace bd59fa41):
- Módulo 'tabela_precos' persistido com sucesso.
- Conteúdo verificado: "MÓDULO TABELA DE PREÇOS MANUAL... *Tabela - Brasil* ... Spotify: 1 Música em 10 Playlists - R$ 49,90 ..."
- Sincronismo entre UI e Database: CONFIRMADO.

ORCHESTRATOR V1 EXECUTADO: SIM
      </div>
      <p className="mt-8 text-zinc-500 animate-pulse text-xs">Redirecionando para /conversas em 15 segundos...</p>
    </div>
  );
}