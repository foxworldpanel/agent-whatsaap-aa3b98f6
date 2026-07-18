import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <div className="p-8 font-mono text-sm whitespace-pre-wrap">
      Novo erro real (bom sinal — é a lógica correta rodando, só falta dado certo):
      "Nenhum workspace válido encontrado para este usuário" — em resolveWorkspaceId, linha 43.
      
      Isso significa que, pro usuário dono do Mind (f8da521a...), nenhum workspace está com is_default=true, 
      e a busca por "qualquer workspace" também não achou nada — o que é estranho, já que sabemos que existe o workspace Mind (bd59fa41).
      
      Preciso que investigue ANTES de corrigir:
      1) Roda: SELECT id, nome, user_id, is_default FROM workspaces WHERE user_id = 'f8da521a-e8db-4efe-8c9b-9bd69749c0a7'
      Mostra o resultado completo — quero ver todos os workspaces desse usuário e o status de is_default de cada um
      2) Não aplica nenhuma correção ainda — só traz esse resultado
      
      Depois que eu ver isso, vou dar a instrução final incluindo uma limpeza: quero manter APENAS o workspace Mind (bd59fa41) ativo daqui pra frente — nenhum outro workspace (nem Smoke Music, nem duplicatas) deve continuar existindo. Mas antes preciso ver o inventário real pra confirmar os IDs certos antes de apagar qualquer coisa.
    </div>
  ),
});
