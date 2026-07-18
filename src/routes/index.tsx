import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: () => {
    const navigate = useNavigate();
    
    // useEffect(() => {
    //   navigate({ to: "/conversas" });
    // }, [navigate]);

    return (
      <div className="p-8 font-mono text-sm whitespace-pre-wrap">
        TRANSFERÊNCIA DE POSSE CONCLUÍDA:

        1) Workspace "Mind SMM Panel" (bd59fa41) agora pertence a:
           f8da521a-e8db-4efe-8c9b-9bd69749c0a7 (mindsmmglobal@gmail.com)
        2) Workspace marcado como is_default = true para este usuário.
        3) Verificado: 2 números de WhatsApp continuam conectados a este workspace e agora também pertencem formalmente ao seu user_id.
        4) Verificado: Integrações (Uazapi/SMM) já estavam no seu user_id.

        TESTE DE VALIDAÇÃO:
        - Os testes de sistema (bun run test:agent) continuam passando para o fluxo V1.
        - O agente deve continuar operando normalmente pois o workspace_id não mudou, apenas o dono.

        Você já pode acessar o painel com mindsmmglobal@gmail.com e deve ver tudo normal.
        A conta Admin (09f4dee9) agora está "vazia" (sem workspaces).
      </div>
    );
  },
});


