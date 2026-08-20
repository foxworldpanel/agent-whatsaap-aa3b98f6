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
    <div className="p-8 max-w-4xl mx-auto whitespace-pre-wrap font-mono text-sm">
      MODO IMPLEMENTAÇÃO (ENGENHEIRO DE SOFTWARE)

      LEIA ANTES DE COMEÇAR

      Pare de interpretar esta tarefa como alteração de interface, documentação ou planejamento.

      A partir desta mensagem, entre em modo implementação.

      Você deve atuar como um engenheiro de software sênior.

      Esta tarefa NÃO é para:
       atualizar textos;
       atualizar README;
       atualizar Validation;
       atualizar Roadmap;
       atualizar Checklists;
       alterar apenas páginas React;
       criar componentes visuais;
       criar TODOs;
       criar comentários "Future";
       criar mocks.

      Se a sua resposta for apenas "texto atualizado", "planejamento atualizado" ou "interface atualizada", considere a tarefa INCOMPLETA e continue implementando código.

      OBJETIVO

      Quero implementação de código.
      Quero novos arquivos.
      Quero novas classes.
      Quero novos serviços.
      Quero novas funções.
      Quero integração funcional.
      Não quero documentação.

      ESTA TAREFA SÓ TERMINA QUANDO EXISTIR CÓDIGO FUNCIONAL

      O primeiro objetivo do Lead Finder é conseguir conectar uma conta do Instagram.
      Ainda não vamos implementar busca por hashtags.
      Ainda não vamos implementar Discovery.
      Ainda não vamos implementar IA.
      Ainda não vamos implementar Sales Agent.
      Primeiro quero apenas conectar uma conta.

      IMPLEMENTAR

      Criar um módulo novo:
      src/lib/instagram-session/

      Criar os arquivos:
      instagram-session-manager.ts
      playwright-session.service.ts
      session-storage.service.ts
      session-validator.service.ts
      types.ts

      Todos devem possuir implementação real.
      Não criar arquivos vazios.

      UTILIZAR PLAYWRIGHT

      Adicionar Playwright ao projeto.
      O Playwright será responsável por abrir um navegador Chromium.

      Fluxo esperado:
      Clique em
      Conectar Conta
      ↓
      Playwright
      ↓
      Abrir Chromium
      ↓
      Abrir
      https://www.instagram.com/
      ↓
      Usuário faz login manual
      ↓
      Caso exista autenticação em duas etapas, aguardar conclusão
      ↓
      Detectar sessão autenticada
      ↓
      Salvar Storage State
      ↓
      Persistir sessão
      ↓
      Atualizar banco
      ↓
      Atualizar interface
      ↓
      Status = Connected

      Não simular login.
      Não marcar Connected manualmente.
      Só considerar Connected quando existir uma sessão autenticada.

      IMPLEMENTAR

      Classe:
      InstagramSessionManager

      Implementar realmente:
      connect()
      disconnect()
      reconnect()
      validate()
      listSessions()
      removeSession()
      getSession()
      Nenhum método poderá ficar vazio.

      SESSION STORAGE

      Criar um serviço responsável por salvar e carregar o Storage State do Playwright.
      Persistir:
       sessão;
       cookies;
       storage state;
       data do login;
       última validação.
      Não armazenar senha.

      BANCO

      Atualizar:
      lead_finder_credentials

      Adicionar suporte para:
      platform
      username
      display_name
      profile_picture
      status
      storage_state_path
      last_login
      last_validation
      last_used
      created_at
      updated_at

      STATUS

      Implementar estados reais:
      Connecting
      Connected
      Expired
      Disconnected
      Error

      Não alterar estados manualmente.
      O estado deverá refletir a sessão real.

      DISCOVERY

      A aba Discovery deverá listar apenas contas Connected.
      Ainda não implementar busca.

      LOGS

      Registrar eventos:
      Conta criada
      Conta conectada
      Conta validada
      Conta desconectada
      Conta removida
      Sessão expirada

      CRITÉRIOS DE ACEITE

      A tarefa NÃO poderá ser considerada concluída enquanto eu não conseguir:
      ✔ clicar em Conectar Conta
      ✔ abrir o navegador
      ✔ abrir Instagram
      ✔ fazer login manual
      ✔ concluir autenticação
      ✔ fechar navegador
      ✔ visualizar a conta como Connected
      ✔ desconectar
      ✔ reconectar
      ✔ remover

      O QUE NÃO FAZER
      Não atualizar documentação.
      Não atualizar Roadmap.
      Não atualizar Validation.
      Não atualizar README.
      Não atualizar apenas a interface.
      Não criar comentários TODO.
      Não criar Future Implementation.
      Não responder dizendo que "o planejamento foi atualizado".

      ENTREGA OBRIGATÓRIA

      Ao finalizar, responder obrigatoriamente:

      1. Arquivos novos criados
      Listar todos.

      2. Arquivos modificados
      Listar todos.

      3. Dependências adicionadas
      Listar todas.

      4. Classes implementadas
      Listar todas.

      5. Funções implementadas
      Listar todas.

      6. Fluxo funcional
      Explicar exatamente o que agora funciona.

      7. Como testar
      Descrever passo a passo para validar a implementação.

      8. Git Diff
      Mostrar os principais trechos alterados ou informar exatamente quais arquivos contêm a implementação.

      Não finalize a tarefa enquanto não existir código funcional implementando esse fluxo.
    </div>
  ),
});


