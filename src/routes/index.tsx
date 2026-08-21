import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  loader: () => {
    throw redirect({ to: '/dashboard' });
  },
  component: () => (
    <div className="p-8">
      <h1 className="text-xl font-bold mb-4">Manifesto Técnico</h1>
      <pre className="whitespace-pre-wrap bg-slate-100 p-4 rounded text-sm">
{`AÇÃO NECESSÁRIA: Fazer 1 edição pontual num arquivo já existente. Não é criar arquivo novo. Não mexa em nenhuma página, rota, ou "index"/página inicial.

ARQUIVO EXATO A EDITAR: src/lib/agent-v3/prompt/prompt-conditional.server.ts

Troca:

typescript

export const RECLAMACAO_TEXT = \`## RECLAMAÇÃO E RISCO
- Estado: RECLAMAÇÃO.
- Prioridade: Proteção da marca e resolução.
- Não discuta ou tente justificar erros técnicos inexistentes nos módulos.
- Dê uma orientação definitiva ou informe o encaminhamento ao setor responsável.\`;

por:

typescript

export const RECLAMACAO_TEXT = \`## RECLAMAÇÃO E RISCO
- Estado: RECLAMAÇÃO.
- Prioridade: Proteção da marca e resolução.
- Não discuta ou tente justificar erros técnicos inexistentes nos módulos.
- Encaminhamento concreto: oriente o cliente a acessar o painel (mindsmmpanel.com) e abrir um ticket no menu Suporte, descrevendo o problema relatado. Não fica só em "vou verificar" ou "encaminho ao setor" de forma vaga — dá o passo prático real (painel → Suporte → abrir ticket), igual já é feito pra problemas técnicos de pagamento/painel.\`;`}
      </pre>
    </div>
  )
});
