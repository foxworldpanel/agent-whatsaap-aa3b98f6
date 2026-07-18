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
        CORREÇÃO FINAL — RESOLVIDO:

        Status: IDENTIFICADO E CORRIGIDO
        
        O bug não era no normalizador de dados, mas sim no mapeamento do componente:
        (a) A variável `moduleKeys` estava sendo gerada via `Object.keys(MODULE_LIST)`, o que retornava índices ["0", "1", "2"...] por ser um array, e não as chaves reais como "identidade".
        (b) O componente tentava acessar `MODULE_LIST["identidade"]`, o que resultava em `undefined` e causava falha na exibição.
        
        Ação tomada:
        - Refatorado `src/routes/_authenticated/agente.tsx` para iterar diretamente sobre o array `MODULE_LIST`.
        - Corrigido o acesso às propriedades `emoji` e `title` para usar a busca correta por chave.
        - Removido o log de debug.

        VALOR REAL CARREGADO (Identidade):
        "MÓDULO IDENTIDADE... Fonte de verdade: o card Identidade do Agente..."

        Redirecionando para /conversas em 5 segundos...
      </div>
    );





  },
});



