import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
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
              EXECUTAR AUDITORIA FINAL DE INTEGRIDADE APÓS A MIGRAÇÃO SINGLE-TENANT.
              Não alterar dashboard nem arquitetura nesta etapa.
              1. Informar quantos registros foram migrados para a Mind em cada uma das 41 tabelas.
              Para cada tabela:
              - quantidade já pertencente à Mind;
              - quantidade com workspace_id nulo;
              - quantidade pertencente ao workspace removido;
              - quantidade migrada;
              - quantidade excluída;
              - quantidade atual.
              2. Verificar se dados do workspace removido foram incorporados à Mind.
              Auditar especialmente:
              - conversas;
              - mensagens;
              - contatos;
              - leads;
              - pedidos;
              - catálogo;
              - serviços;
              - prompts;
              - configurações do agente;
              - números de WhatsApp;
              - integrações;
              - analytics;
              - usuários e memberships.
              3. Identificar duplicidades criadas pela migração:
              - contatos repetidos;
              - serviços repetidos;
              - configurações duplicadas;
              - módulos duplicados;
              - integrações duplicadas;
              - números WhatsApp duplicados.
              4. Confirmar se a exclusão do workspace antigo ocorreu somente depois da migração e do backup.
              5. Mostrar o backup ou referência de recuperação do workspace removido:
              a4c51e0c...
              6. Validar as constraints nas 41 tabelas:
              - nome da constraint;
              - tabela;
              - coluna;
              - condição;
              - status validado.
              7. Confirmar que nenhuma tabela com workspace_id ficou sem constraint.
              8. Revisar funções SECURITY DEFINER:
              - owner;
              - search_path;
              - permissões de execução;
              - possibilidade de bypass da RLS;
              - uso de parâmetros vindos do cliente.
              9. Executar testes reais:
              - abrir o painel;
              - recarregar com F5;
              - salvar configuração;
              - consultar catálogo;
              - enviar mensagem pelo WhatsApp;
              - confirmar analytics;
              - tentar inserir outro workspace_id;
              - tentar criar novo workspace.
              FINALIZAR COM:
              REGISTROS MIGRADOS POR TABELA:
              DADOS DO WORKSPACE REMOVIDO INCORPORADOS À MIND: SIM/NÃO
              DUPLICIDADES ENCONTRADAS:
              DUPLICIDADES CORRIGIDAS: SIM/NÃO
              BACKUP DO WORKSPACE REMOVIDO VALIDADO: SIM/NÃO
              41 TABELAS COM CONSTRAINT VALIDADA: SIM/NÃO
              TABELAS COM WORKSPACE_ID SEM CONSTRAINT:
              SECURITY DEFINER AUDITADO: SIM/NÃO
              BYPASS DE RLS POSSÍVEL: SIM/NÃO
              CRIAÇÃO DE OUTRO WORKSPACE BLOQUEADA: SIM/NÃO
              INSERÇÃO COM OUTRO WORKSPACE_ID BLOQUEADA: SIM/NÃO
              PAINEL MIND APROVADO: SIM/NÃO
              WHATSAPP APROVADO: SIM/NÃO
              SINGLE-TENANT CONCLUÍDO: SIM/NÃO
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
