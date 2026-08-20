import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  return (
    <div className="p-8 font-sans max-w-4xl mx-auto space-y-8">
      <div className="bg-destructive/10 border-2 border-destructive p-6 rounded-xl text-destructive">
        <h1 className="text-2xl font-bold mb-2">CRITICAL: Instagram Connection is NOT working</h1>
        <p className="font-medium text-lg italic">tem que fazer funcionar a conexão do instagram no lead finder</p>
      </div>

      <div className="bg-muted p-6 rounded-xl border-2 border-primary/20">
        <h2 className="text-xl font-bold text-primary mb-4">BUG P0 – IMPLEMENTAR FLUXO FUNCIONAL DE CONEXÃO DO INSTAGRAM</h2>
        
        <div className="space-y-6 text-sm">
          <section>
            <h3 className="font-bold uppercase text-xs tracking-wider opacity-70">Status da Implementação</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
              <div className="bg-background p-2 rounded border flex items-center gap-2">
                <span className="text-green-500">✅</span>
                <span>Infra (.server.ts)</span>
              </div>
              <div className="bg-background p-2 rounded border flex items-center gap-2">
                <span className="text-green-500">✅</span>
                <span>Playwright Service</span>
              </div>
              <div className="bg-background p-2 rounded border flex items-center gap-2">
                <span className="text-red-500">❌</span>
                <span>Build Client-Side</span>
              </div>
              <div className="bg-background p-2 rounded border flex items-center gap-2">
                <span className="text-green-500">✅</span>
                <span>Server Functions</span>
              </div>
              <div className="bg-background p-2 rounded border flex items-center gap-2">
                <span className="text-yellow-500">⚠️</span>
                <span>UI Feedback</span>
              </div>
              <div className="bg-background p-2 rounded border flex items-center gap-2">
                <span className="text-red-500">❌</span>
                <span>Fluxo de Login</span>
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-bold uppercase text-xs tracking-wider opacity-70">Problema Detectado</h3>
            <p className="text-base mt-1 text-destructive font-medium">O build está falhando devido a vazamento de dependências do servidor (Playwright/Node) para o bundle do cliente através de arquivos de teste e importações dinâmicas mal resolvidas.</p>
          </section>

          <section className="bg-primary/5 p-4 rounded border border-primary/20">
            <h3 className="font-bold uppercase text-xs tracking-wider opacity-70">Modo de Operação</h3>
            <p className="mt-2 font-medium">Corrigindo o isolamento do bundle para restaurar o funcionamento do Lead Finder. Foco total em <strong>STABILITY</strong> e <strong>VISIBILITY</strong>.</p>
          </section>
        </div>
      </div>

      <footer className="pt-8 border-t flex justify-between items-center text-xs text-muted-foreground italic">
        <span>Minha avaliação</span>
        <span>2026-08-20 22:40 UTC</span>
      </footer>
    </div>
  );
}
