import { createFileRoute } from "@tanstack/react-router";
import { Bot } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agente")({
  ssr: false,
  head: () => ({ meta: [{ title: "Agente IA · ZapAgent" }] }),
  component: AgentePage,
});

function AgentePage() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <Bot className="h-10 w-10 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">Agente IA</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Página zerada. Envie o primeiro módulo para começarmos a construir do zero.
      </p>
    </div>
  );
}
