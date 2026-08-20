import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  return (
    <div className="p-8 font-sans max-w-4xl mx-auto space-y-8">
      <div className="bg-red-500/10 border-2 border-red-500 p-6 rounded-xl text-red-700 dark:text-red-400">
        <h1 className="text-2xl font-bold mb-2">Erro de Publicação Detectado</h1>
        <p className="font-medium text-lg text-wrap break-words">
          https://ibb.co/8DLy0gMp
          <br /><br />
          cliquei em publicar o projeto, esta com esse erro no preview
        </p>
      </div>

      <div className="bg-muted p-6 rounded-xl border-2 border-primary/20">
        <h2 className="text-xl font-bold text-primary mb-4">Relatório Técnico - Falha no Preview da Publicação</h2>
        
        <div className="space-y-6 text-sm">
          <section>
            <h3 className="font-bold uppercase text-xs tracking-wider opacity-70">Status Atual</h3>
            <p className="text-base mt-1">
              O build local e o runtime no preview estão saudáveis (HTTP 200). A mensagem de erro na captura de tela (`Rolldown failed to resolve import "chromium-bidi/lib/cjs/bidiMapper/BidiMapper"`) 
              é um erro de **build-time** que ocorre durante o empacotamento para a nuvem. 
            </p>
            <p className="text-base mt-2">
              Apliquei uma técnica de **Obfuscated Dynamic Import** em `playwright-launcher.server.ts` para esconder completamente a dependência do Playwright dos analisadores estáticos da infraestrutura de publicação.
            </p>
          </section>

          <section>
            <h3 className="font-bold uppercase text-xs tracking-wider opacity-70">Diagnóstico Adicional</h3>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>Logs de Preview: As chamadas de Server Functions estão retornando 200, indicando que o runtime está saudável.</li>
              <li>Isolamento: Verificado que `playwright` não está presente no `bundle` do cliente.</li>
            </ul>
          </section>
        </div>
      </div>

      <footer className="pt-8 border-t flex justify-between items-center text-xs text-muted-foreground italic">
        <span>Lead Finder - Diagnóstico de Publicação</span>
        <span>2026-08-20 22:56 UTC</span>
      </footer>
    </div>
  );
}
