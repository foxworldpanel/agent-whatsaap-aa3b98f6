import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <div className="min-h-screen bg-background p-8 font-mono text-sm whitespace-pre-wrap">
      IMPLEMENTAÇÃO OBRIGATÓRIA – CORREÇÃO DO INSTAGRAM SESSION MANAGER (SEM DOCUMENTAÇÃO)

      CONTEXTO

      Foi realizada uma auditoria completa do código atual.

      A arquitetura criada está correta.

      Os serviços do Instagram Session Manager já existem.

      Porém a implementação possui erros de fluxo que impedem o funcionamento correto.

      Esta tarefa NÃO é de documentação.

      NÃO atualizar:

       README

       Validation

       Roadmap

       Página Inicial

       Checklists

       Interface apenas visual

      Esta tarefa é EXCLUSIVAMENTE para implementação e correção de código.

      Se qualquer alteração for apenas em textos, considere a tarefa INCOMPLETA.

      OBJETIVO

      Corrigir a implementação atual do Instagram Session Manager para que o fluxo de autenticação funcione corretamente.

      Não criar uma nova arquitetura.

      Não criar novos mocks.

      Corrigir a implementação existente.

      CORREÇÃO 1 — REMOVER O FLUXO "USUÁRIO PENDENTE"

      Problema encontrado

      Hoje a interface executa:

      CredentialService.addCredential({"{ username: \"pendente\" }"})

      ANTES da autenticação.

      Esse fluxo está arquiteturalmente incorreto.

      O banco recebe registros falsos.

      Isso não pode existir.

      Implementação obrigatória

      Remover completamente esse comportamento.

      O fluxo correto deverá ser:

      Usuário clica em

      Conectar Conta

      ↓

      InstagramSessionManager.connect()

      ↓

      Playwright abre Chromium

      ↓

      Instagram Login

      ↓

      Usuário realiza login

      ↓

      Autenticação concluída

      ↓

      Capturar username

      ↓

      Capturar display_name

      ↓

      Capturar profile_picture

      ↓

      Criar credential

      ↓

      Salvar Storage State

      ↓

      Status = Connected

      Nunca criar registros "pendente".

      Nunca criar credenciais antes do login.

      CORREÇÃO 2 — SESSION MANAGER É O ÚNICO RESPONSÁVEL PELA CRIAÇÃO DA CREDENTIAL

      Hoje a UI cria a credential.

      Isso está errado.

      A UI nunca poderá chamar:

      CredentialService.addCredential()

      A UI deverá chamar apenas:

      InstagramSessionManager.connect()

      O próprio Session Manager será responsável por:

       descobrir o usuário autenticado;

       criar a credential;

       salvar storageState;

       atualizar status.

      Toda lógica deve sair da UI.

      CORREÇÃO 3 — REMOVER TOASTS FALSOS

      Hoje existe:

      toast.success("Conta conectada com sucesso")

      logo após iniciar a conexão.

      Isso é incorreto.

      O sucesso somente poderá ocorrer quando TODAS as etapas abaixo forem concluídas:

       navegador abriu;

       login concluído;

       sessão autenticada;

       storageState salvo;

       credential criada;

       banco atualizado.

      Qualquer erro deverá cancelar o fluxo.

      CORREÇÃO 4 — VALIDAÇÃO REAL DA SESSÃO

      Hoje o sistema considera Connected apenas porque o login terminou.

      Implementar validação real.

      Fluxo:

      Salvar Storage State

      ↓

      Abrir novo BrowserContext

      ↓

      Carregar Storage State

      ↓

      Abrir Instagram

      ↓

      Confirmar sessão autenticada

      ↓

      Atualizar status Connected

      Caso contrário:

      Status = Expired

      CORREÇÃO 5 — IMPLEMENTAR MÁQUINA DE ESTADOS

      Implementar estados reais.

      Never Connected

      Connecting

      Connected

      Expired

      Disconnected

      Error

      Nunca alterar esses estados manualmente.

      Todos deverão refletir o estado real da sessão.

      CORREÇÃO 6 — IMPLEMENTAR TRATAMENTO DE ERROS

      Criar tratamento para:

       navegador não abriu;

       Playwright indisponível;

       login cancelado;

       timeout;

       autenticação inválida;

       storageState não salvo;

       banco indisponível.

      Nunca retornar sucesso nesses casos.

      CORREÇÃO 7 — REORGANIZAÇÃO DA UI

      A UI deverá apenas iniciar a conexão.

      Fluxo obrigatório:

      Button

      ↓

      connectInstagram()

      ↓

      InstagramSessionManager

      ↓

      Playwright

      ↓

      Banco

      ↓

      Atualizar UI

      Nenhuma regra de negócio poderá permanecer dentro do componente React.

      CORREÇÃO 8 — LOGS

      Adicionar logs estruturados.

      Registrar:

      Browser Started

      Browser Closed

      Login Started

      Login Success

      Storage Saved

      Credential Created

      Credential Updated

      Session Validated

      Session Expired

      Connection Failed

      Todos devem possuir timestamp.

      CORREÇÃO 9 — BANCO

      Revisar a migration.

      Garantir que lead_finder_credentials possua:

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

      Caso qualquer coluna esteja ausente:

      Criar migration.

      Atualizar tipos.

      Atualizar interfaces.

      CORREÇÃO 10 — TESTE FUNCIONAL

      Criar um teste automatizado que valide:

      Button

      ↓

      InstagramSessionManager.connect()

      ↓

      Playwright

      ↓

      Instagram

      ↓

      Login

      ↓

      StorageState

      ↓

      Credential

      ↓

      Banco

      ↓

      Connected

      O teste deverá falhar caso qualquer etapa não seja executada.

      CORREÇÃO 11 — CÓDIGO MORTO

      Revisar todo o módulo.

      Remover:

       TODO

       mocks antigos

       comentários "Future"

       código não utilizado

       funções órfãs

      CRITÉRIOS DE ACEITE

      A tarefa somente poderá ser marcada como concluída quando:

      ✅ Nenhuma credential "pendente" existir.

      ✅ A UI não criar mais registros.

      ✅ Apenas o Session Manager criar credentials.

      ✅ O login ocorrer antes da criação da conta.

      ✅ O Storage State for salvo corretamente.

      ✅ Connected representar uma sessão realmente autenticada.

      ✅ O toast de sucesso depender do retorno real do Session Manager.

      ✅ Todos os erros forem tratados.

      ✅ O teste de integração passar.

      PROIBIDO

      Não atualizar:

       README

       Validation

       Roadmap

       Página inicial

       Interface textual

       Documentação

      Não criar:

       Novas telas

       Novos checklists

       Novos planejamentos

      Esta tarefa é exclusivamente de IMPLEMENTAÇÃO.

      ENTREGA OBRIGATÓRIA

      Ao finalizar responder obrigatoriamente:

      Arquivos modificados

      Listar todos.

      Arquivos criados

      Listar todos.

      Funções implementadas

      Listar todas.

      Código removido

      Listar.

      Bugs corrigidos

      Listar um por um.

      Fluxo implementado

      Explicar exatamente qual fluxo passou a funcionar.

      Como testar

      Descrever passo a passo para validar que a conexão realmente funciona.

      Autoauditoria

      Antes de concluir, revisar o próprio código e confirmar que:

       não existem mais credenciais criadas antes do login;

       a UI não contém regra de negócio;

       o Session Manager é o único responsável pela autenticação e persistência da sessão;

       todos os critérios de aceite acima foram atendidos.
    </div>
  ),
});