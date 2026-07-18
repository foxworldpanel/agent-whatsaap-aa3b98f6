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
        Preciso limpar todo o histórico de conversa do número de teste 5511970116430 (workspace Mind, bd59fa41), pra começar do zero — esse contato acumulou muitas mensagens de um dia inteiro de testes/debug, o que está distorcendo qualquer medição de custo real.

AÇÃO:
1) Localiza o contact_id correspondente a esse telefone no workspace Mind
2) Apaga todas as mensagens (messages) dessa conversa
3) Apaga a conversa (conversation) em si, ou reseta ela pra um estado zerado (o que for mais simples/seguro no seu esquema)
4) NÃO apaga o contato em si (contact) — só o histórico de conversa, pra eu poder continuar testando com esse mesmo número
5) Confirma que isso NÃO afeta nenhum outro contato, conversa, ou dado de outros clientes reais — só esse número específico

TESTE DE VALIDAÇÃO:
1) Confirma que a conversa desse número aparece vazia/nova depois da limpeza
2) Roda bun run test:agent pra garantir que a limpeza de dado não quebrou nenhum teste automatizado
3) Não precisa testar no WhatsApp agora — só confirma que ficou limpo
        
        Redirecionando para /conversas em 15 segundos...
      </div>
    );
  },
});
