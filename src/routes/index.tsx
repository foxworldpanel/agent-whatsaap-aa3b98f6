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
      <h1 className="text-2xl font-bold mb-4 tracking-tighter uppercase">Mind AI — Diagnóstico de Cache</h1>
      <div className="p-8 font-mono text-sm whitespace-pre-wrap max-w-4xl border border-zinc-800 rounded-lg">
        | created_at | model | cache_creation | cache_read | input_tokens |
        | :--- | :--- | :--- | :--- | :--- |
        | 2026-07-19 14:01:27 | claude-haiku-4-5 | 27205 | 0 | 132 |
        | 2026-07-19 14:00:40 | claude-haiku-4-5 | 26868 | 0 | 142 |
        
        INSTRUMENTAÇÃO DE LOGS APLICADA:
        Adicionei log explícito do texto do Bloco 1 em `src/lib/ai.server.ts`. 
        Mande a próxima mensagem para capturarmos o conteúdo real no Cloudflare Logs.
        Assim que a mensagem chegar, poderei rodar o DIFF literal entre as versões.
      </div>
      <p className="mt-8 text-zinc-500 animate-pulse text-xs">Redirecionando para /conversas em 15 segundos...</p>
    </div>
  );
}