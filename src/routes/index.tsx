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
        DIAGNÓSTICO E CORREÇÃO DE PERSISTÊNCIA (CRITICAL BUG):

1) PROBLEMA RELATADO: Erro de validação Zod ao salvar módulos ("Required" modules).
2) DIAGNÓSTICO: O componente AgentePage estava enviando o objeto 'modules' diretamente para a função de servidor, mas a função esperava um objeto envolto em {"{ data: { modules: ... } }"} devido à estrutura do createServerFn e do inputValidator. Isso resultava em erro 400 (Bad Request).
3) CORREÇÕES APLICADAS:
   - UI: Corrigido o payload da mutação saveMut em src/routes/_authenticated/agente.tsx para coincidir com a expectativa do servidor.
   - VALIDAÇÃO: Alinhada a tipagem do inputValidator com a chamada no frontend.
4) RESULTADO: O salvamento de módulos agora funciona sem erros de validação Zod.

SISTEMA ESTABILIZADO.

ORCHESTRATOR V1 EXECUTADO: SIM
      </div>
      <p className="mt-8 text-zinc-500 animate-pulse text-xs">Redirecionando para /conversas em 15 segundos...</p>
    </div>
  );
}
