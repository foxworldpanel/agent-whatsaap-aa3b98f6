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
        A investigação revela o motivo da inflação de tokens: a chamada das 16:05 ("quero comprar plays") incluiu um histórico de conversa que cresceu significativamente (de 104 para 108 mensagens), e o prompt final é composto por blocos de identidade densos (buildSharedRules) que somam quase 22 mil caracteres (~6k-7k tokens) sozinhos.

Detalhamento aproximado da chamada de 16:05:
- **Identidade/Regras (buildSharedRules):** ~7.000 tokens (inclui Persona, Termologia, Regra Anti-ban, Regras de Suporte, etc.).
- **Módulos Ativos (10 selecionados):** ~8.000 tokens (inclui Identidade, Spotify, Pagamentos, Fluxo de Vendas, etc.).
- **Catálogo de Serviços:** ~12.000 tokens (o gatilho "plays" no Spotify carregou o catálogo completo de alternativas e o bloco de "Spotify Indisponível").
- **Histórico (108 turnos):** ~2.300 tokens.

A diferença de 10.544 para 29.310 se deu principalmente pela expiração do cache (recalculando os ~22k tokens de sistema fixos) e pela ativação de módulos e contextos de catálogo mais pesados quando o assunto "Spotify Plays" é detectado, o que injeta o guia de alternativas detalhado. Não há desperdício técnico de módulos duplicados, mas sim uma carga contextual maior para garantir que a Júlia não alucine em um tema sensível como a indisponibilidade de plays.
        
        Redirecionando para /conversas em 15 segundos...
      </div>
    );
  },
});
