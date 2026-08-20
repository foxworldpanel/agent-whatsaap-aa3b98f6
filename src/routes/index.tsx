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
      Revisar a implementação do Instagram Session Manager.

      Foram encontrados problemas que impedem a funcionalidade.

      Corrigir:

       O navegador está sendo iniciado com:
      headless: true
      Como o login será manual, alterar para:
      headless: false

       Validar se a migration da tabela lead_finder_credentials contém todas as colunas utilizadas pelo InstagramSessionManager (storage_state_path, display_name, profile_picture, last_validation etc.). Se não existir, criar a migration correspondente.

       Após a autenticação, manter o navegador aberto apenas até salvar o storageState, depois encerrá-lo corretamente.

       Garantir que o botão Conectar Conta da interface realmente invoque connectInstagramAction, em vez de apenas alterar estado visual.

       Entregar uma forma simples de testar:
       clicar em "Conectar Conta";
       abrir o Chromium visível;
       fazer login manual;
       salvar a sessão;
       atualizar o status para Connected.

      Não alterar a interface. Não atualizar documentação. Apenas corrigir a implementação existente.
    </div>
  ),
});
