# Checkpoint — Concorrência e consistência do histórico

## Arquivo alterado

- `src/routes/api/public/hooks/uazapi-webhook.ts`

## Problemas corrigidos

### 1. Perda de contexto com mensagens simultâneas

Duas mensagens recebidas quase ao mesmo tempo podiam carregar o mesmo histórico, executar o agente em paralelo e salvar estados concorrentes. A última gravação podia apagar o turno processado pela primeira execução.

Foi adicionada uma fila por `workspace + telefone`, serializando o pipeline do Agent V3 dentro da mesma instância do servidor.

> Observação: em uma implantação com múltiplas instâncias/processos, a garantia global ainda deve ser implementada com lock distribuído, fila ou operação atômica no banco.

### 2. Histórico registrava respostas não entregues

O histórico era salvo antes do envio ao WhatsApp. Se o envio de texto ou áudio falhasse, a próxima execução acreditava que o cliente havia recebido uma resposta que nunca foi entregue.

Agora o histórico só é persistido depois que o envio é concluído com sucesso.

## Validação

- ZIP original extraído e alteração aplicada diretamente sobre a versão `(20)`.
- Estrutura e sintaxe de blocos revisadas estaticamente.
- `npm ci` foi tentado, mas excedeu o tempo disponível; portanto, Vitest e TypeScript completo não foram executados neste checkpoint.
