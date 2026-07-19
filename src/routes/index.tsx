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
        CORREÇÃO DE CONCORRÊNCIA APLICADA (globalThis removido integralmente, incluindo fullSystemFallback).
        
        1) PROVA REAL DO CACHE
        Bom dia! Acabei de mandar 2 mensagens de teste, poucos segundos de diferença, mesma conversa (5511970116430), depois de uma noite inteira sem nenhuma edição de código. Roda a query e cola o resultado bruto:SELECT created_at, model, metadata-&gt;&apos;cache_creation_input_tokens&apos; as cache_creation, metadata-&gt;&apos;cache_read_input_tokens&apos; as cache_read, metadata-&gt;&apos;input_tokens&apos; as input_tokens FROM agent_prompt_metrics WHERE workspace_id = &apos;bd59fa41-d68d-4ac8-b995-e09ae48f52aa&apos; ORDER BY created_at DESC LIMIT 2;

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