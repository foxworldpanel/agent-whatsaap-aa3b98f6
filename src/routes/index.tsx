import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: Index,
});

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
      <h1 className="text-2xl font-bold mb-4 tracking-tighter uppercase">Mind AI — Diagnóstico de Cache & Fechamento</h1>
      <div className="p-8 font-mono text-sm whitespace-pre-wrap max-w-2xl border border-zinc-800 rounded-lg">
        CORREÇÃO DE CONCORRÊNCIA APLICADA (globalThis removido).
        
        1) PROVA REAL DO CACHE
        Antes de considerar a reestruturação do cache resolvida, preciso da prova prática: testa 2 mensagens seguidas na mesma conversa (poucos segundos de diferença), com conteúdo DIFERENTE entre elas (ex: uma sobre Spotify, outra sobre YouTube, forçando módulos condicionais diferentes), e mostra os dados brutos reais das duas chamadas (cache_creation_input_tokens e cache_read_input_tokens de cada uma). Preciso ver cache_read &gt; 0 na segunda, com meus próprios olhos em número real, não afirmação de que "deveria funcionar".

        2) BUG NÃO RESPONDIDO — PERGUNTA REPETIDA NO FECHAMENTO
        Você não respondeu sobre o segundo problema que reportei: a Júlia, depois de direcionar o cliente pro painel corretamente, emenda uma pergunta genérica "Qual serviço você quer impulsionar?" mesmo quando o serviço já foi estabelecido antes na conversa (o cliente já tinha dito que queria plays pro Spotify).

        Investiga o bloco de fechamento/tutorial (buildRegraFechamentoTutorialBlock ou equivalente) — ele tem uma pergunta final fixa que sempre é adicionada, independente do contexto já estabelecido? Se sim, corrige pra só perguntar isso quando o serviço realmente ainda não foi definido na conversa.

        TESTE DE VALIDAÇÃO:
        1) Traz os números reais do teste de cache (item 1)
        2) Simula a conversa completa do bug do fechamento e confirma que não repete mais a pergunta de descoberta já respondida
        3) Roda bun run test:agent
      </div>
      <p className="mt-8 text-zinc-500 animate-pulse text-xs">Redirecionando para /conversas em 15 segundos...</p>
    </div>
  );
}
