import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <div className="p-8 font-mono text-sm whitespace-pre-wrap">
      Preciso resolver de vez a confusão de workspace duplicado/dono trocado, e simplificar pra usar SÓ 1 workspace daqui pra frente (o Mind real).

      PASSO 1 — INVENTÁRIO DEFINITIVO (sem filtro de user_id, busca em TODA a tabela workspaces)
      Roda: SELECT w.id, w.nome, w.user_id, w.is_default, COUNT(n.id) as numeros_conectados FROM workspaces w LEFT JOIN whatsapp_numbers n ON n.workspace_id = w.id GROUP BY w.id, w.nome, w.user_id, w.is_default
      Mostra TODOS os workspaces existentes no banco, com a contagem de números WhatsApp conectados em cada um. O workspace com números conectados é, sem ambiguidade nenhuma, o Mind real — não importa qual user_id apareça, é esse que fica.

      PASSO 2 — CORRIGE O is_default
      No workspace que tiver números conectados (o Mind real), marca is_default = true. Isso resolve o erro "Nenhum workspace válido encontrado" que está impedindo o app de carregar agora.

      PASSO 3 — APAGA TODOS OS OUTROS WORKSPACES
      Qualquer workspace SEM número WhatsApp conectado deve ser apagado (cascade, removendo contatos/conversas/config vazios associados a ele). Só sobra o workspace com os números conectados.

      PASSO 4 — RESÍDUO agent-v2
      Você mencionou ter restaurado fisicamente o diretório src/lib/agent-v2 "pra garantir integridade do build" — isso significa que ainda existe alguma referência/import quebrado pra ele em algum lugar. Investiga qual arquivo ainda depende de agent-v2, corrige esse import (removendo a dependência, não mantendo a pasta), e SÓ DEPOIS disso remove o diretório de novo. Não deixa a pasta agent-v2 no repositório de forma permanente.

      TESTE DE VALIDAÇÃO OBRIGATÓRIO:
      1) Publica
      2) Acessa você mesmo a URL de produção e confirma que carrega o app normal
      3) Confirma que só existe 1 workspace agora (o Mind com os números)
      4) Confirma que o build funciona sem a pasta agent-v2
      5) SÓ DEPOIS me avisa pra eu testar no WhatsApp real

      Antes de apagar qualquer workspace no Passo 3, mostra o resultado do Passo 1 aqui primeiro — quero confirmar visualmente qual tem os números antes de qualquer exclusão acontecer.
    </div>
  ),
});
