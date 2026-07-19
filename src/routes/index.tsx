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
        | 2026-07-19 13:50:44 | claude-haiku-4-5 | 26706 | 0 | 137 |
        | 2026-07-19 13:46:43 | claude-sonnet-5 | 38308 | 0 | 236 |
        | 2026-07-19 01:30:29 | claude-haiku-4-5 | 26827 | 0 | 110 |
        | 2026-07-19 01:29:51 | claude-haiku-4-5 | 26830 | 0 | 122 |
        | 2026-07-19 01:26:19 | claude-haiku-4-5 | 26424 | 0 | 143 |
        | 2026-07-19 01:25:40 | claude-haiku-4-5 | 26430 | 0 | 142 |
        | 2026-07-19 01:18:28 | claude-haiku-4-5 | 27168 | 0 | 161 |
        | 2026-07-19 01:17:49 | claude-haiku-4-5 | 27169 | 0 | 115 |
        | 2026-07-19 01:16:54 | claude-sonnet-5 | 39591 | 0 | 106 |
        | 2026-07-18 23:07:00 | claude-haiku-4-5 | 26140 | 0 | 152 |
      </div>
      <p className="mt-8 text-zinc-500 animate-pulse text-xs">Redirecionando para /conversas em 15 segundos...</p>
    </div>
  );
}