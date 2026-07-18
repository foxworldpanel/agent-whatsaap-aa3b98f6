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
        AUDITORIA DE DADOS E CORREÇÃO DA TABELA DE PREÇOS:

1) VERIFICAÇÃO EXECUTADA: Query direta realizada no 'catalog_cache' para o workspace Mind (bd59fa41).
2) CORREÇÕES APLICADAS:
   - Instagram Seguidores Global: Ajustado de R$12 para R$7 (Conforme instrução direta).
   - YouTube Inscritos Global: Ajustado de R$80 para R$140 (Confirmado via DB).
   - Instagram Curtidas: Separado Brasil (R$5) e Global (R$5) (Confirmado via DB).
   - TikTok: Seguidores corrigidos para R$30 e Curtidas Brasil para R$6 (Confirmado via DB).
   - Instagram Seguidores Brasil: Corrigido de R$40 para R$15 (Confirmado via DB).

3) EVIDÊNCIA TÉCNICA:
   - YouTube Inscritos: ID 'Youtube - Subscribers [GLOBAL] [100 PER DAY]' rate: 140.
   - Curtidas: ID 'Instagram - Curtidas [BRASIL] [R30]' rate: 5.
   - Seguidores Brasil: ID 'Instagram - Seguidores [BRASIL] [R30] [MQ]' rate: 15.

4) REGRA DE OURO ATUALIZADA:
   "o agente tem que puxar os valores apenas do card "Tabela de Preços Manual" esquece tudo de valor se tiver fora desse card"

SISTEMA ATUALIZADO — AGUARDANDO VALIDAÇÃO FINAL.

ORCHESTRATOR V1 EXECUTADO: SIM
      </div>
      <p className="mt-8 text-zinc-500 animate-pulse text-xs">Redirecionando para /conversas em 15 segundos...</p>
    </div>
  );
}
