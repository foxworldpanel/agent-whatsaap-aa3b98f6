import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: () => {
    const navigate = useNavigate();
    
    useEffect(() => {
      const timer = setTimeout(() => {
        navigate({ to: "/conversas" });
      }, 5000);
      return () => clearTimeout(timer);
    }, [navigate]);

    return (
      <div className="p-8 font-mono text-sm whitespace-pre-wrap">
        CORREÇÃO CIRÚRGICA E FINAL:

        1) FILTRO DE NÚMEROS: Atualizado para permitir APENAS "5511970116430".
        2) PUBLICADO: src/routes/api/public/hooks/uazapi-webhook.ts
        3) TIMESTAMP: 2026-07-18T14:21:28Z (UTC)
        4) PROPAGAÇÃO: Aguarde 2-3 minutos.

        O redirecionamento automático para /conversas ocorrerá em 5 segundos.
        
        ORCHESTRATOR V1 EXECUTADO: SIM
      </div>
    );
  },
});


