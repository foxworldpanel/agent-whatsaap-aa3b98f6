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
      IMPLEMENTAÇÃO FUNCIONAL – Instagram Session Manager (SEM MOCKS)

      LEIA ATÉ O FINAL ANTES DE IMPLEMENTAR

      Esta tarefa NÃO é de documentação.

      NÃO atualizar:
       README
       Validation
       Roadmap
       Checklist
       Comentários
       ADR

      Esta tarefa NÃO é de UI.
      A interface já existe.
      O objetivo agora é implementar o CÓDIGO que faz a funcionalidade funcionar.
      Não alterar apenas textos.
      Não criar novos mocks.
      Não criar TODO.
      Não criar comentários "Future Implementation".
      A tarefa somente será considerada concluída quando existir código executável implementando o fluxo abaixo.

      Biblioteca obrigatória
      Utilizar Playwright para abrir um navegador Chromium local e permitir que o usuário realize o login manual no Instagram.
      O Playwright será utilizado apenas para abrir o navegador, aguardar o login e persistir a sessão autenticada.
      Não implementar scraping nesta tarefa.

      Objetivo
      Implementar um Instagram Session Manager funcional.
      O usuário deverá conseguir:
       clicar em Conectar Conta;
       abrir o navegador;
       acessar Instagram;
       realizar login manual;
       concluir eventual autenticação em duas etapas;
       salvar a sessão autenticada;
       fechar o navegador;
       visualizar a conta como Connected.

      Arquivos obrigatórios
      Criar:
      src/lib/instagram-session/
      Dentro dele:
      instagram-session-manager.ts
      playwright-session.service.ts
      session-storage.service.ts
      session-validator.service.ts
      types.ts

      Dependências
      Adicionar Playwright ao projeto.
      Criar um serviço responsável exclusivamente pela comunicação com Playwright.
      Nenhum outro módulo poderá abrir navegador diretamente.

      Session Manager
      Implementar uma classe responsável por:
      connect()
      disconnect()
      reconnect()
      validate()
      remove()
      listSessions()
      getSession()
      Todos os métodos devem possuir implementação real.
      Não criar métodos vazios.

      Fluxo obrigatório
      Ao clicar:
      Conectar Conta
      executar:
      InstagramSessionManager.connect()
      Fluxo:
      Abrir Chromium
      ↓
      Abrir
      https://www.instagram.com/
      ↓
      Aguardar login manual
      ↓
      Aguardar autenticação em duas etapas
      ↓
      Detectar login concluído
      ↓
      Salvar Storage State
      ↓
      Salvar informações da conta
      ↓
      Atualizar banco
      ↓
      Atualizar interface
      ↓
      Status = Connected

      Login concluído
      Considerar login concluído somente quando existir sessão autenticada.
      Após isso:
      capturar:
       username
       display_name
       avatar (quando possível)
       data do login
      Persistir essas informações.

      Persistência
      Salvar a sessão autenticada utilizando Storage State do Playwright.
      Não armazenar senha.
      Não armazenar token permanente.
      Persistir apenas o estado autenticado da sessão.

      Banco
      Atualizar:
      lead_finder_credentials
      Campos obrigatórios:
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

      Estados
      Implementar estados reais.
      Connecting
      Connected
      Expired
      Disconnected
      Error
      Nunca permitir alterar status manualmente.
      O status deve refletir a sessão.

      Reconectar
      Ao clicar:
      Reconectar
      Executar:
      Abrir navegador
      ↓
      Carregar Storage State
      ↓
      Validar sessão
      ↓
      Atualizar banco

      Desconectar
      Ao clicar:
      Desconectar
      Executar:
      Invalidar sessão
      ↓
      Excluir Storage State
      ↓
      Atualizar banco
      ↓
      Status = Disconnected

      Discovery
      Na aba Discovery.
      Mostrar apenas contas:
      Connected

      Logs
      Registrar:
      Conta criada
      Conta conectada
      Sessão validada
      Sessão expirada
      Conta desconectada
      Conta removida

      Interface
      A interface já existe.
      Somente integrar com o Session Manager.
      Não criar novas telas.

      Critérios obrigatórios
      A tarefa NÃO poderá ser marcada como concluída enquanto não for possível:
      ✓ clicar em Conectar Conta
      ✓ abrir navegador
      ✓ abrir Instagram
      ✓ realizar login manual
      ✓ salvar sessão
      ✓ fechar navegador
      ✓ visualizar conta Connected
      ✓ desconectar
      ✓ reconectar
      ✓ remover

      NÃO FAZER
      Não atualizar documentação.
      Não atualizar Validation.
      Não atualizar README.
      Não atualizar Roadmap.
      Não criar checklist.
      Não criar comentários Future.
      Não criar mocks.
      Não simular estados.
      Não retornar sucesso sem abrir o navegador.

      Entrega obrigatória
      Ao finalizar responder obrigatoriamente:
      Arquivos criados
      Listar todos.
      Arquivos modificados
      Listar todos.
      Dependências adicionadas
      Listar.
      Funções implementadas
      Listar.
      Fluxo executável
      Explicar exatamente qual fluxo passou a funcionar.
      Como testar
      Descrever passo a passo para validar que a conexão realmente funciona.
    </div>
  ),
});

