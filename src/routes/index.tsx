import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: () => {
    const navigate = useNavigate();
    
    useEffect(() => {
      const timer = setTimeout(() => {
        navigate({ to: "/conversas" });
      }, 15000);
      return () => clearTimeout(timer);
    }, [navigate]);

    return (
      <div className="p-8 font-mono text-sm whitespace-pre-wrap">
        Confirmado o risco previsto. Restaura o roteamento pra Sonnet especificamente no caso reengagement_greeting — mantém Haiku 4.5 em todo o resto (texto normal, áudio transcrito, disparo normal), só esse cenário específico volta pro Sonnet.Isso não é um retrocesso geral — é manter a única exceção que já tem prova concreta de necessidade (Haiku falha nela, Sonnet não). Todas as outras reduções de custo (Haiku no áudio, Haiku no texto comum) continuam valendo.TESTE DE VALIDAÇÃO:1) Roda bun run test:agent2) Repete o cenário exato de hoje (gap de 1h+ e "Boa tarde") e confirma que agora reapresenta a isca corretamente3) Confirma que uma mensagem de áudio comum e uma mensagem de texto comum (sem reengajamento) continuam usando Haiku4) Roda a suíte completa
        
        Redirecionando para /conversas em 15 segundos...
      </div>
    );
  },
});
