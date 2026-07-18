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
        DIAGNÓSTICO DE ESTRUTURA DE DADOS (Agente IA):

        Workspace: bd59fa41-d68d-4ac8-b995-e09ae48f52aa
        
        Buscando conteúdo da coluna 'modules' em agent_config...
        
        Preciso saber: essa estrutura bate com os módulos que configuramos ao longo dos últimos dias (persona da Júlia, terminologia por rede, exemplo de disparo, regras de segurança, catálogo Spotify/YouTube/Instagram/TikTok, etc — os ~44 módulos), ou parece ser uma estrutura DIFERENTE, mais enxuta, que pode ter sido escrita pela experimentação da V2 por cima do dado original?

        NÃO apaga nem restaura nada ainda — só mostra o conteúdo real pra eu confirmar o diagnóstico antes de decidir a correção.
      </div>
    );
  },
});


