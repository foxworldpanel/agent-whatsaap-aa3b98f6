import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  return (
    <div className="p-8 font-sans max-w-4xl mx-auto space-y-8 whitespace-pre-wrap">
      <h1 className="text-3xl font-bold border-b pb-4 text-primary">
        BUG P0 – IMPLEMENTAR FLUXO FUNCIONAL DE CONEXÃO DO INSTAGRAM
      </h1>

      <div className="space-y-6">
        <section>
          <h2 className="text-xl font-bold uppercase mb-2">Modo</h2>
          <p>Entrar em modo Senior Backend Engineer / Full Stack Engineer.</p>
          <p>Esta tarefa é exclusivamente de implementação.</p>
          <ul className="list-disc pl-5">
            <li>Não atualizar documentação.</li>
            <li>Não atualizar README.</li>
            <li>Não atualizar Validation.</li>
            <li>Não atualizar Roadmap.</li>
            <li>Não atualizar textos.</li>
            <li>Não atualizar apenas a interface.</li>
            <li>Não criar novas arquiteturas.</li>
          </ul>
          <p className="mt-2 font-semibold">Corrigir a implementação existente.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold uppercase mb-2">Problema</h2>
          <p>O módulo Instagram Session Manager existe.</p>
          <p>As Server Functions existem.</p>
          <p>A infraestrutura existe.</p>
          <p>Porém o usuário ainda não consegue conectar uma conta Instagram.</p>
          <p>A funcionalidade principal do módulo continua indisponível.</p>
          <p className="font-bold text-destructive mt-2">Esta Sprint NÃO poderá ser concluída enquanto não existir um fluxo utilizável.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold uppercase mb-2">Objetivo</h2>
          <p>Entregar uma funcionalidade completa onde um usuário consiga:</p>
          <div className="flex flex-col items-center my-4 space-y-1 font-mono">
            <span>Accounts</span>
            <span>↓</span>
            <span>Adicionar Conta</span>
            <span>↓</span>
            <span>Conectar Instagram</span>
            <span>↓</span>
            <span>Login</span>
            <span>↓</span>
            <span>Sessão salva</span>
            <span>↓</span>
            <span>Conta aparece como Connected</span>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold uppercase mb-2">Implementação Obrigatória</h2>
          
          <div className="space-y-4">
            <div>
              <h3 className="font-bold">1. Fluxo funcional</h3>
              <p>Ao clicar: <strong>Conectar Conta</strong> o sistema deverá:</p>
              <ul className="list-disc pl-5 text-sm">
                <li>executar EnvironmentCheck;</li>
                <li>caso o ambiente seja compatível, iniciar a autenticação;</li>
                <li>abrir o navegador quando aplicável;</li>
                <li>aguardar login;</li>
                <li>capturar storageState;</li>
                <li>criar/atualizar a credencial;</li>
                <li>validar a sessão;</li>
                <li>atualizar a interface.</li>
              </ul>
            </div>

            <div className="bg-muted p-4 rounded border">
              <h3 className="font-bold">2. Caso o ambiente NÃO suporte autenticação</h3>
              <p>Não deixar o botão simplesmente não fazer nada.</p>
              <p>Exibir erro técnico claro.</p>
              <p className="italic mt-2 text-sm">Exemplo: "Este ambiente não suporta autenticação do Instagram. Execute esta funcionalidade em um ambiente Node com Playwright habilitado."</p>
            </div>

            <div>
              <h3 className="font-bold">3. Estado da UI</h3>
              <p>Durante o processo mostrar:</p>
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono my-2">
                <span>Conectando...</span> <span>↓</span>
                <span>Abrindo navegador...</span> <span>↓</span>
                <span>Aguardando login...</span> <span>↓</span>
                <span>Salvando sessão...</span> <span>↓</span>
                <span>Validando sessão...</span> <span>↓</span>
                <span>Conectado</span> <span>ou</span> <span className="text-destructive">Erro</span>
              </div>
              <p className="text-sm font-semibold italic">Nunca deixar o botão sem resposta.</p>
            </div>

            <div>
              <h3 className="font-bold">4. Atualização automática</h3>
              <p>Após conectar com sucesso: Atualizar automaticamente a lista de contas. Não exigir refresh manual.</p>
            </div>

            <div>
              <h3 className="font-bold">5. Tratamento de erros</h3>
              <p>Tratar explicitamente:</p>
              <ul className="list-disc pl-5 text-sm grid grid-cols-2 gap-x-4">
                <li>Playwright indisponível;</li>
                <li>Chromium indisponível;</li>
                <li>DISPLAY inexistente;</li>
                <li>login cancelado;</li>
                <li>timeout;</li>
                <li>falha ao salvar Storage State;</li>
                <li>falha ao validar sessão.</li>
              </ul>
              <p className="mt-1 text-sm">Todos os erros devem chegar até a interface.</p>
            </div>

            <div>
              <h3 className="font-bold">6. Logs</h3>
              <p className="text-sm">Registrar: Connect Button Clicked, Environment Check, Browser Started, Login Started, Login Success, Storage Saved, Credential Upsert, Validation Success, Connected, Connection Failed.</p>
            </div>
          </div>
        </section>

        <section className="border-2 border-primary p-4 rounded-lg">
          <h2 className="text-xl font-bold uppercase mb-2">7. Critério obrigatório</h2>
          <p>Esta tarefa somente poderá ser considerada concluída quando for possível realizar o seguinte teste:</p>
          <ol className="list-decimal pl-5 space-y-1 mt-2">
            <li>Abrir o Lead Finder.</li>
            <li>Entrar em Accounts.</li>
            <li>Clicar em Conectar Conta.</li>
            <li>O sistema iniciar o fluxo de autenticação.</li>
            <li>Após o login, a conta aparecer automaticamente como Connected.</li>
          </ol>
          <p className="font-bold mt-2">Se esse fluxo não funcionar, considerar a Sprint incompleta.</p>
        </section>

        <section className="bg-secondary/20 p-4 rounded">
          <h2 className="text-xl font-bold uppercase mb-2">8. Entrega obrigatória</h2>
          <p>Ao finalizar responder obrigatoriamente:</p>
          <ul className="list-disc pl-5 text-sm">
            <li>Arquivos modificados.</li>
            <li>Fluxo implementado.</li>
            <li>Como testar.</li>
            <li>O botão Conectar Conta agora inicia o fluxo de autenticação? (SIM/NÃO)</li>
            <li>A conexão foi validada em ambiente compatível? (SIM/NÃO)</li>
            <li>Caso NÃO, explicar exatamente qual dependência ainda impede o funcionamento.</li>
          </ul>
        </section>
      </div>

      <footer className="pt-8 border-t">
        <p className="font-bold italic">Minha avaliação</p>
      </footer>
    </div>
  );
}
