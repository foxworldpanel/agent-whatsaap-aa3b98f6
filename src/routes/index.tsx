import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, ListFilter, Trash2, Database, ShieldCheck, ArrowRight, Clock, Rocket, Search, LayoutGrid, ClipboardList } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: DecommissioningLanding,
});

function DecommissioningLanding() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redireciona para o dashboard caso não queira ver a página de descomissionamento
    // navigate({ to: "/conversas" });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-red-100 p-2 text-red-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 whitespace-pre-wrap">
              DECISÃO DE ARQUITETURA:
              Este painel será utilizado exclusivamente pelo workspace MIND.
              Não haverá suporte multi-workspace neste projeto.
              O único workspace válido deve ser:
              Nome: Mind
              Workspace ID: bd59fa41-d68d-4ac8-b995-e09ae48f52aa
              REMOVER DEFINITIVAMENTE TODOS OS OUTROS WORKSPACES E TODA A COMPLEXIDADE DE MULTI-TENANCY QUE NÃO FOR MAIS NECESSÁRIA.
              IMPORTANTE:
              Não apagar registros cegamente.
              Primeiro realizar inventário, backup, validação de relacionamentos e somente depois excluir os workspaces não-Mind.
              ==================================================
              FASE 1 — BACKUP OBRIGATÓRIO
              ==================================================
              Antes de qualquer exclusão:
              1. Exportar a tabela de workspaces.
              2. Exportar todas as tabelas relacionadas aos workspaces que serão removidos.
              3. Criar backup do banco.
              4. Registrar:
                 - IDs dos workspaces;
                 - nomes;
                 - owners;
                 - memberships;
                 - quantidade de conversas;
                 - quantidade de contatos;
                 - configurações;
                 - catálogos;
                 - números WhatsApp;
                 - integrações;
                 - analytics;
                 - pedidos ou dados comerciais.
              Criar um relatório claro separando:
              A. Workspace Mind, que será preservado;
              B. Workspaces que serão excluídos;
              C. Dados órfãos ou sem workspace_id;
              D. Dados compartilhados que não podem ser apagados automaticamente.
              Não executar exclusão antes de concluir esse relatório.
              ==================================================
              FASE 2 — IDENTIFICAR O WORKSPACE MIND
              ==================================================
              Confirmar tecnicamente:
              - workspace_id: bd59fa41-d68d-4ac8-b995-e09ae48f52aa;
              - nome;
              - slug;
              - status;
              - owner;
              - usuários autorizados;
              - número da UAZAPI;
              - catálogo;
              - configurações do agente;
              - módulos;
              - conversas;
              - analytics;
              - integrações.
              Não criar outro workspace Mind.
              Não trocar o ID existente.
              Não migrar a Mind para um novo registro.
              ==================================================
              FASE 3 — MAPEAR DEPENDÊNCIAS DOS OUTROS WORKSPACES
              ==================================================
              Para cada workspace diferente da Mind, levantar referências em:
              - users;
              - memberships;
              - agents;
              - agent_modules;
              - prompts;
              - conversations;
              - messages;
              - contacts;
              - leads;
              - orders;
              - services;
              - catalog;
              - integrations;
              - WhatsApp instances;
              - phone numbers;
              - webhooks;
              - analytics;
              - usage logs;
              - billing;
              - API keys;
              - settings;
              - files;
              - automations;
              - jobs;
              - queues;
              - audit logs.
              Verificar também:
              - foreign keys;
              - triggers;
              - functions;
              - RPCs;
              - RLS policies;
              - storage paths;
              - cron jobs;
              - variáveis de ambiente;
              - caches;
              - referências por slug ou nome.
              ==================================================
              FASE 4 — TRATAR DADOS IMPORTANTES
              ==================================================
              Antes de excluir qualquer workspace não-Mind:
              - preservar dados que pertencem à Mind, mesmo que estejam vinculados incorretamente;
              - migrar para a Mind apenas registros comprovadamente da Mind;
              - não migrar dados automaticamente com base apenas no nome;
              - não duplicar conversas, contatos, pedidos ou configurações;
              - não mover dados de terceiros para a Mind;
              - registrar toda migração realizada.
              Dados incertos devem ser mantidos no backup e não transferidos.
              ==================================================
              FASE 5 — EXCLUIR WORKSPACES NÃO-MIND
              ==================================================
              Após backup e validação, excluir todos os registros da tabela de workspaces cujo ID seja diferente de:
              bd59fa41-d68d-4ac8-b995-e09ae48f52aa
              Usar exclusão controlada e transacional.
              A ordem deve respeitar as foreign keys.
              Não usar exclusão genérica sem verificar impacto.
              Se houver cascata automática, listar antecipadamente tudo que será apagado.
              Executar preferencialmente em uma migration ou script auditável.
              ==================================================
              FASE 6 — LIMPAR DADOS ÓRFÃOS
              ==================================================
              Após a exclusão, localizar registros:
              - com workspace_id nulo;
              - com workspace_id inexistente;
              - vinculados aos workspaces removidos;
              - duplicados;
              - criados pelo bug de workspace vazio.
              Não apagar dados históricos importantes sem classificação.
              Separar em:
              A. remover;
              B. vincular corretamente à Mind;
              C. manter para análise;
              D. exportar e arquivar.
              ==================================================
              FASE 7 — SIMPLIFICAR O FRONTEND
              ==================================================
              Como haverá apenas a Mind:
              - remover seletor de workspace;
              - remover troca de workspace;
              - remover lista de workspaces;
              - remover estado de último workspace;
              - remover fallback para workspace vazio;
              - remover criação de novo workspace;
              - remover rotas de administração de múltiplos workspaces;
              - remover badges, filtros e textos multi-tenant.
              O contexto deve carregar exclusivamente:
              bd59fa41-d68d-4ac8-b995-e09ae48f52aa
              Mas ainda deve validar:
              - usuário autenticado;
              - acesso autorizado ao painel;
              - permissões da conta.
              O ID pode ser configurado centralmente em uma constante ou variável de ambiente:
              MIND_WORKSPACE_ID=bd59fa41-d68d-4ac8-b995-e09ae48f52aa
              Não espalhar o UUID em vários arquivos.
              ==================================================
              FASE 8 — SIMPLIFICAR O BACKEND
              ==================================================
              Todas as funções devem utilizar o workspace Mind como contexto único.
              Remover:
              - resolução dinâmica de workspace;
              - fallback pelo primeiro workspace;
              - seleção por localStorage;
              - lookup por último workspace;
              - roteamento multi-tenant;
              - loops por vários workspaces;
              - criação automática de workspace;
              - branches específicas para outros workspaces.
              Manter validação de segurança no backend.
              Nenhuma requisição pode aceitar um workspace_id arbitrário vindo do frontend sem validação.
              ==================================================
              FASE 9 — BANCO E SEGURANÇA
              ==================================================
              Revisar RLS policies para o modelo single-workspace.
              Garantir que:
              - usuários não autorizados não acessem a Mind;
              - não seja possível inserir outro workspace;
              - não seja possível alterar o ID da Mind;
              - não seja possível criar dados com workspace_id diferente;
              - inserts sem workspace_id sejam bloqueados;
              - updates não possam mover registros para outro workspace.
              Considerar constraint ou trigger que rejeite workspace_id diferente de:
              bd59fa41-d68d-4ac8-b995-e09ae48f52aa
              Não aplicar constraint antes de limpar os dados antigos.
              ==================================================
              FASE 10 — REMOVER CÓDIGO MULTI-WORKSPACE
              ==================================================
              Buscar e revisar:
              - workspace-context.tsx;
              - workspace selector;
              - workspace switcher;
              - create workspace;
              - delete workspace;
              - update workspace;
              - memberships multi-workspace;
              - workspace slug routing;
              - activeWorkspace;
              - currentWorkspace;
              - selectedWorkspace;
              - lastWorkspace;
              - defaultWorkspace;
              - workspace list;
              - workspace resolver;
              - workspace mapper;
              - agent-shared.server.ts.
              Não apagar agent-shared.server.ts automaticamente.
              Primeiro confirmar se ele contém apenas resolução multi-workspace ou também utilitários necessários.
              Mover utilitários úteis para arquivos neutros e remover o restante.
              ==================================================
              FASE 11 — TESTES OBRIGATÓRIOS
              ==================================================
              Testar:
              - login autorizado;
              - login não autorizado;
              - abertura da home;
              - abertura do Agente IA;
              - F5;
              - nova aba;
              - logout e login;
              - catálogo;
              - configurações;
              - salvamento de módulos;
              - WhatsApp;
              - analytics;
              - histórico;
              - mídia;
              - pedidos;
              - integrações.
              Confirmar que:
              - a Mind sempre carrega;
              - nenhum workspace vazio aparece;
              - nenhum outro workspace pode ser criado;
              - nenhuma tela de seleção de workspace permanece;
              - nenhuma consulta retorna dados de workspace removido;
              - nenhum dado da Mind foi perdido.
              ==================================================
              FASE 12 — EVIDÊNCIAS FINAIS
              ==================================================
              Apresentar:
              - lista de workspaces encontrados antes;
              - lista de workspaces removidos;
              - IDs removidos;
              - quantidade de registros excluídos por tabela;
              - registros migrados para a Mind;
              - registros órfãos encontrados;
              - backups gerados;
              - migrations/scripts executados;
              - arquivos alterados;
              - código multi-workspace removido;
              - resultado do build;
              - resultado dos testes;
              - teste real do painel;
              - teste real do WhatsApp.
              FINALIZAR COM:
              WORKSPACE MIND PRESERVADO: SIM/NÃO
              WORKSPACE_ID MIND:
              QUANTIDADE DE WORKSPACES ANTES:
              QUANTIDADE DE WORKSPACES REMOVIDOS:
              QUANTIDADE DE WORKSPACES DEPOIS:
              OUTROS WORKSPACES EXCLUÍDOS: SIM/NÃO
              BACKUP DO BANCO REALIZADO: SIM/NÃO
              DADOS DA MIND PRESERVADOS: SIM/NÃO
              DADOS MIGRADOS PARA A MIND:
              REGISTROS ÓRFÃOS ENCONTRADOS:
              REGISTROS ÓRFÃOS CORRIGIDOS: SIM/NÃO
              SELETOR DE WORKSPACE REMOVIDO: SIM/NÃO
              CRIAÇÃO DE WORKSPACE BLOQUEADA: SIM/NÃO
              MULTI-TENANCY REMOVIDA: SIM/NÃO
              MIND_WORKSPACE_ID CENTRALIZADO: SIM/NÃO
              RLS REVISADA: SIM/NÃO
              CONSTRAINT SINGLE-WORKSPACE IMPLEMENTADA: SIM/NÃO
              BUILD APROVADO: SIM/NÃO
              TESTES APROVADOS: SIM/NÃO
              PAINEL CARREGA APENAS A MIND: SIM/NÃO
              WHATSAPP FUNCIONANDO: SIM/NÃO
            </h1>
          </div>
          <div className="flex items-center gap-4 border-t pt-4">
            <Link to="/conversas">
              <Button size="lg" className="font-bold">
                Acessar Operação V2 <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </header>

        <footer className="text-center text-xs text-slate-400">
          ZapAgent Decommissioning Utility · Version 1.0.0-beta · July 2026
        </footer>
      </div>
    </div>
  );
}
