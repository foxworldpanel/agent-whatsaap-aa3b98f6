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
          Preciso que você faça 2 edições pontuais no arquivo src/routes/api/public/hooks/uazapi-webhook.ts (não substitua o arquivo inteiro, é muito grande — só troque esses 2 trechos):

Edição 1 — trocar:

typescript

// Uma retransmissão recebida após restart ou em outra instância pode escapar
    // do mapa em memória. O external_id único no banco impede que ela gere uma
    // segunda resposta automática.
    if (duplicateMessageInDb) {
      console.log(`[UAZ-WEBHOOK] [AUDIT] RETORNO: duplicate persisted msgId: \${msgId}`);
      return new Response("ok (duplicate persisted msgId)");
    }

por:

typescript

// Uma retransmissão recebida após restart ou em outra instância pode escapar
    // do mapa em memória. O external_id único no banco impede que ela gere uma
    // segunda resposta automática.
    //
    // IMPORTANTE (correção de regressão do Welcome Funnel): antes, uma mensagem
    // duplicada retornava aqui imediatamente, ANTES do Funnel Gate/Welcome
    // Funnel (seção 3.4/3.5) rodar. Isso significa que se o UAZAPI reenviasse
    // o mesmo evento (comportamento normal de retry de webhook) depois que a
    // mensagem já tivesse sido persistida na 1ª tentativa, o funil NUNCA
    // chegava a ser verificado em nenhuma das duas tentativas — mesmo com a
    // mensagem, contato e conversa corretamente salvos no banco. O Funnel Gate
    // e o Welcome Funnel já são idempotentes por design própria (tabela
    // welcome_funnel_runs + lock atômico em agent_generation_locks), então é
    // seguro deixá-los rodar aqui também — só a geração de resposta da IA
    // (mais abaixo) continua bloqueada em caso de duplicata, pra nunca mandar
    // 2 respostas pro cliente.
    const isDuplicateDelivery = duplicateMessageInDb;
    if (isDuplicateDelivery) {
      console.log(`[UAZ-WEBHOOK] [AUDIT] Mensagem duplicada (msgId \${msgId}) — pulando resposta da IA, mas ainda verificando Welcome Funnel (idempotente).`);
    }

Edição 2 — trocar:

typescript

// 4. AGENT GATES — aplicados DEPOIS do funil.
    // A chave global desliga/liga a IA em todas as conversas; a chave individual
    // permite exceção manual por conversa. O recebimento continua sincronizado no CRM.

por:

typescript

// Bloqueio da resposta da IA pra mensagens duplicadas — o Welcome Funnel
    // já teve a chance de rodar acima (idempotente), agora sim replicamos o
    // comportamento original: nunca gerar uma 2ª resposta de IA pro cliente.
    if (isDuplicateDelivery) {
      console.log(`[UAZ-WEBHOOK] [AUDIT] RETORNO: duplicate persisted msgId (após checagem do funil): \${msgId}`);
      return new Response("ok (duplicate persisted msgId)");
    }

    // 4. AGENT GATES — aplicados DEPOIS do funil.
    // A chave global desliga/liga a IA em todas as conversas; a chave individual
    // permite exceção manual por conversa. O recebimento continua sincronizado no CRM.
        </p>
      </div>
    </div>
  ),
});