import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      throw redirect({ to: "/dashboard" });
    }
    throw redirect({ to: "/auth" });
  },
  component: () => (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 font-mono text-sm text-foreground">
      <div className="max-w-2xl space-y-4 rounded-xl border border-border bg-card p-6 shadow-2xl">
        <p className="text-muted-foreground whitespace-pre-wrap">
          {`BUG-001 — Evitar saudação duplicada após o Funil de Boas-vindas

Contexto

O Agent V3 possui um Funil de Boas-vindas que envia automaticamente:

 Áudio de apresentação

 Link do painel

 Vídeo explicativo

 Tabela de serviços

Após o término desse funil, o cliente responde normalmente.

Hoje, quando a resposta é gerada pelo Claude, o agente inicia novamente a conversa com uma saudação como:

 Bom dia

 Boa tarde

 Boa noite

 Olá

 Oi

 Tudo bem?

Isso gera uma experiência artificial porque o cliente já foi recepcionado pelo próprio funil.

Objetivo

Garantir que, após a execução do Funil de Boas-vindas, o modelo continue a conversa sem iniciar uma nova saudação.

Implementação

A solução deve ser baseada em estado da conversa, nunca em substituição simples de texto.

Adicionar ao contexto da conversa um indicador equivalente a:

conversationContext.greetingAlreadyPerformed = true;

Esse estado deve ser ativado quando:

 o Funil de Boas-vindas terminar;

 ou a conversa já possuir uma saudação enviada anteriormente pelo agente.

Regra

Se greetingAlreadyPerformed == true:

A resposta do Claude não pode iniciar com expressões como:

 Olá

 Oi

 Bom dia

 Boa tarde

 Boa noite

 Tudo bem?

 Como vai?

O modelo deve assumir que a conversa já está em andamento.

Exemplo:

❌ Errado

Boa tarde, Andy! Entendo sua preocupação...

✅ Correto

Entendo sua preocupação. Muitas pessoas chegam até nós com essa mesma dúvida...

Importante

Não alterar:

 Prompt Builder

 Module Selector

 Business State

 Funil de Boas-vindas

 Fluxo do WhatsApp

A correção deve ocorrer apenas na preparação do contexto enviada ao modelo ou na camada responsável por controlar o estado da conversa.

Não utilizar

Não utilizar regex simples removendo "Boa tarde" da resposta.

Essa abordagem é frágil.

A decisão deve ser baseada no estado da conversa.

Critérios de aceite

Cenário 1

Funil enviado.

Cliente responde.

O Claude responde sem saudação.

✅ Correto.

Cenário 2

Cliente já está conversando há várias mensagens.

O Claude nunca reinicia a conversa com uma nova saudação.

✅ Correto.

Cenário 3

Nova conversa.

Sem funil anterior.

Sem saudação anterior.

O Claude pode cumprimentar normalmente.

✅ Correto.

Regressões

Validar que:

 novas conversas continuam iniciando normalmente;

 apenas conversas já iniciadas deixam de receber uma nova saudação;

 nenhum outro comportamento do Agent V3 seja alterado.`}
        </p>
      </div>
    </div>
  ),
});
