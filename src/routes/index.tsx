import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: () => {
    const navigate = useNavigate();
    
    useEffect(() => {
      navigate({ to: "/conversas" });
    }, [navigate]);

    return (
      <div className="p-8 font-mono text-sm whitespace-pre-wrap">
        Aprovado, prossegue com a limpeza definitiva dos resíduos V2:
        1) Remove os blocos de importação/execução de agent-v2 no uazapi-webhook.ts (Whisper, classificação de lead, orchestrator)
        2) Remove o throw que bloqueia o Mind de usar V1
        3) Remove as funções auxiliares de V2 em agent.functions.ts
        4) Remove fisicamente src/lib/agent-v2 e src/lib/agent-v3 — dessa vez SEM precisar restaurar depois, porque os imports quebrados foram removidos primeiro

        TESTE DE VALIDAÇÃO OBRIGATÓRIO:
        1) Confirma que o build funciona sem agent-v2/agent-v3 (bun run build ou equivalente)
        2) Publica
        3) Acessa você mesmo a URL de produção, confirma que carrega normal
        4) Roda bun run test:agent e confirma que os testes ainda passam
        5) SÓ DEPOIS me avisa pra eu testar no WhatsApp real
      </div>
    );
  },
});
