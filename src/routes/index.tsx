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
        Possível regressão confirmada logo no primeiro teste depois da mudança pra Haiku-only: cliente mandou só "Boa tarde" e a Júlia respondeu "Então, você quer divulgar quantas músicas no Spotify?" — sem retribuir a saudação, indo direto pra pergunta técnica antiga.Isso é exatamente o padrão de falha que já tínhamos identificado e corrigido ontem forçando Sonnet nesse cenário específico (reengagement_greeting). Preciso investigar se é isso mesmo:1) Confirma: essa conversa específica (contato de agora, "Boa tarde" às 15:46) tinha histórico anterior com gap de tempo, e isBlastThread ou o contexto de conversa antiga ativo? Ou seja, é genuinamente um caso de "reengagement_greeting" que deveria ter disparado o veto?2) Se SIM: confirma que reengagementGreeting foi calculado como true nesse turno, e mostra se o veto foi injetado no prompt. Se foi injetado mas o Haiku ignorou (mesmo padrão de ontem), isso confirma exatamente o risco que já sabíamos.3) Traz o "Prompt enviado ao Claude" real dessa chamada específica, e a resposta bruta gerada, pra eu confirmar a causa exataNÃO aplica correção ainda — só confirma se é o cenário de reengajamento falhando com Haiku, do jeito que já suspeitávamos.
        
        Redirecionando para /conversas em 15 segundos...
      </div>
    );
  },
});
