/* dashboard nao esta abrindo */
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
    // Redireciona para o dashboard principal
    navigate({ to: "/conversas" });

  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-red-100 p-2 text-red-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 whitespace-pre-wrap leading-relaxed">
              REGRESSÃO CRÍTICA APÓS A REMOÇÃO DA V1:
              No menu “Agente IA”, os módulos não estão carregando.
              NÃO alterar a home, dashboard, textos ou checklists.
              NÃO recriar agent-modules.ts.
              NÃO restaurar arquivos da V1.
              NÃO criar uma lista estática de módulos apenas para fazer os cards aparecerem.
              O objetivo é corrigir a integração da interface com a fonte real de módulos da Runtime V2.

              ==================================================
              1. REPRODUZIR E IDENTIFICAR O ERRO
              ==================================================
              Abrir a página “Agente IA” no workspace Mind:
              bd59fa41-d68d-4ac8-b995-e09ae48f52aa
              Verificar e apresentar:
              - erros do console do navegador;
              - requisições que falharam;
              - status HTTP;
              - resposta da API;
              - erro do servidor;
              - loader/action usado pela rota;
              - estado recebido pelo componente;
              - quantidade de módulos retornados.

              Não declarar corrigido sem reproduzir o problema real.

              ==================================================
              2. AUDITAR A TELA AGENTE IA
              ==================================================
              Localizar:
              - rota da página Agente IA;
              - componente responsável pelos cards;
              - hooks utilizados;
              - loader;
              - API ou função de consulta;
              - tipos importados;
              - fonte dos dados.

              Buscar referências removidas ou quebradas, incluindo:
              - agent-modules;
              - AGENT_MODULES;
              - moduleDefinitions;
              - defaultModules;
              - legacyModules;
              - getAgentModules;
              - workspace modules;
              - agent_v2_modules;
              - module registry;
              - registry.

              Confirmar exatamente de onde a tela deveria receber os módulos depois da remoção da V1.

              ==================================================
              3. USAR A FONTE CANÔNICA DA V2
              ==================================================
              A interface deve carregar os módulos da fonte canônica da V2.
              Usar uma destas fontes, conforme a arquitetura já implementada:
              A. Module Registry V2 no backend; ou
              B. tabela persistente de módulos/configurações do agente vinculada à Mind.

              A fonte usada pela interface deve corresponder à fonte usada pelo runtime.
              Não manter duas listas independentes de módulos.

              Fluxo esperado:
              Module Registry V2 / banco da Mind
                      ↓
              loader ou endpoint autenticado
                      ↓
              página Agente IA
                      ↓
              cards editáveis
                      ↓
              persistência
                      ↓
              runtime V2 utiliza as configurações salvas

              ==================================================
              4. VERIFICAR DADOS NO BANCO
              ==================================================
              Consultar as tabelas relacionadas aos módulos do agente.
              Informar:
              - nome da tabela;
              - quantidade total de registros;
              - quantidade vinculada à Mind;
              - módulos ativos;
              - módulos inativos;
              - registros com workspace_id incorreto;
              - duplicidades;
              - configurações nulas ou inválidas.

              Não preencher todos os módulos automaticamente sem verificar a fonte canônica.
              Caso a tabela esteja vazia porque os módulos existiam apenas na V1:
              - gerar uma migration/seed V2 idempotente;
              - criar somente os módulos oficialmente registrados na V2;
              - vincular ao workspace Mind;
              - não recriar os 46 módulos antigos;
              - não duplicar registros ao executar novamente.

              ==================================================
              5. FALLBACK CORRETO
              ==================================================
              Se ainda não existir configuração persistida para um módulo registrado:
              - mostrar o módulo com os defaults definidos no Registry V2;
              - permitir edição;
              - persistir ao salvar.

              Não exibir tela vazia.
              Não usar fallback da V1.
              Não esconder erros silenciosamente.

              A interface deve distinguir:
              - carregando;
              - nenhum módulo registrado;
              - falha ao carregar;
              - módulos carregados.

              ==================================================
              6. SINGLE-TENANT
              ==================================================
              Todas as consultas devem usar exclusivamente:
              MIND_WORKSPACE_ID = bd59fa41-d68d-4ac8-b995-e09ae48f52aa
              Mesmo sendo single-tenant, validar autenticação e autorização no backend.
              Não aceitar workspace_id arbitrário enviado pelo navegador.

              ==================================================
              7. EDIÇÃO E PERSISTÊNCIA
              ==================================================
              Após os módulos aparecerem, testar:
              - abrir um módulo;
              - editar instrução;
              - alterar prioridade;
              - alterar modo;
              - ativar/desativar;
              - salvar;
              - atualizar a página;
              - confirmar persistência;
              - confirmar que o runtime recebe a configuração atualizada.

              Não considerar concluído apenas porque os cards aparecem.

              ==================================================
              8. TESTES OBRIGATÓRIOS
              ==================================================
              Executar:
              1. abrir Agente IA;
              2. confirmar quantidade de módulos;
              3. confirmar nomes;
              4. confirmar ausência de duplicidades;
              5. editar um módulo;
              6. salvar;
              7. pressionar F5;
              8. confirmar persistência;
              9. testar em nova aba;
              10. executar build;
              11. executar testes;
              12. enviar uma mensagem real pelo WhatsApp;
              13. confirmar no log quais módulos foram selecionados no turno.

              ==================================================
              9. EVIDÊNCIAS
              ==================================================
              Apresentar:
              - causa raiz;
              - erro original;
              - arquivos alterados;
              - diff resumido;
              - consulta real ao banco;
              - quantidade de módulos antes e depois;
              - fonte canônica utilizada;
              - resposta do loader/API;
              - resultado do teste de persistência;
              - resultado do build;
              - resultado dos testes;
              - evidência do runtime selecionando os módulos.

              FINALIZAR COM:
              CAUSA RAIZ:
              TELA AINDA DEPENDIA DA V1: SIM/NÃO
              FONTE CANÔNICA DOS MÓDULOS:
              MÓDULOS EXISTENTES NO REGISTRY V2:
              MÓDULOS EXISTENTES NO BANCO DA MIND:
              MÓDULOS EXIBIDOS NA INTERFACE:
              LISTA ESTÁTICA LEGADA RECRIADA: SIM/NÃO
              CARREGAMENTO FUNCIONANDO: SIM/NÃO
              EDIÇÃO FUNCIONANDO: SIM/NÃO
              PERSISTÊNCIA APÓS F5: SIM/NÃO
              RUNTIME UTILIZA AS ALTERAÇÕES SALVAS: SIM/NÃO
              BUILD: OK/FALHA
              TESTES: OK/FALHA
              AGENTE IA APROVADO: SIM/NÃO
              PRONTO PARA PRODUÇÃO: SIM/NÃO
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

