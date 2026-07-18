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
        MAPEAMENTO DEFINITIVO DE USUÁRIOS:

        1) user_id: f8da521a-e8db-4efe-8c9b-9bd69749c0a7
           E-mail: mindsmmglobal@gmail.com
           Display Name: mindsmmglobal
           Status: Contém integrações ativas (uazapi.com)

        2) user_id: 09f4dee9-0a1b-4c43-b083-75cc64feb99d
           E-mail: adminmindsmmglobal@gmail.com
           Display Name: Admin
           Status: Atualmente é o dono do workspace "Mind SMM Panel" no banco

        CONCLUSÃO:
        O e-mail mindsmmglobal@gmail.com corresponde ao user_id f8da521a-e8db-4efe-8c9b-9bd69749c0a7.

        Aguardando sua instrução para unificação ou exclusão.
      </div>
    );
  },
});

