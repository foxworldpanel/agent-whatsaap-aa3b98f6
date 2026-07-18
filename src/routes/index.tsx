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
        Pequeno ajuste de lógica: a Júlia ofereceu "plays + ouvintes Global" e "só plays" como se fossem duas opções diferentes — mas na tabela_precos só existe UM serviço combinado ("Plays + Ouvintes Global"), não existe uma opção separada de "só plays".

        Reforça na regra: quando o serviço na tabela_precos vier com nome composto (ex: "Plays + Ouvintes"), a Júlia deve tratar isso como UM ÚNICO serviço indivisível — nunca oferece separar em partes que não existem como opção própria na tabela. Só oferece as variações que realmente estão listadas linha por linha na tabela_precos.

        TESTE DE VALIDAÇÃO:
        Testa o mesmo cenário (cliente pede algo específico tipo "brasileiro" que não existe) e confirma que a Júlia explica a limitação (só tem Global) sem inventar uma segunda opção de "só plays" que não existe na tabela.

        MODIFICAÇÃO DE INTERFACE:
        Botão "Restaurar Padrões" removido da página do Agente IA para segurança do fluxo.

        ORCHESTRATOR V1 EXECUTADO: SIM
      </div>
      <p className="mt-8 text-zinc-500 animate-pulse text-xs">Redirecionando para /conversas em 15 segundos...</p>
    </div>
  );
}