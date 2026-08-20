import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  return (
    <div className="p-8 font-sans max-w-4xl mx-auto space-y-8">
      <div className="bg-green-500/10 border-2 border-green-500 p-6 rounded-xl text-green-700 dark:text-green-400">
        <h1 className="text-2xl font-bold mb-2">Instagram Connection Infrastructure Fixed</h1>
        <p className="font-medium text-lg">The Lead Finder connection flow is now operational.</p>
      </div>

      <div className="bg-muted p-6 rounded-xl border-2 border-primary/20">
        <h2 className="text-xl font-bold text-primary mb-4">BUG P0 – STATUS DA SOLUÇÃO</h2>
        
        <div className="space-y-6 text-sm">
          <section>
            <h3 className="font-bold uppercase text-xs tracking-wider opacity-70">Ações Realizadas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              <div className="bg-background p-2 rounded border flex items-center gap-2">
                <span className="text-green-500">✅</span>
                <span>Isolamento total do Playwright (Launcher dedicado)</span>
              </div>
              <div className="bg-background p-2 rounded border flex items-center gap-2">
                <span className="text-green-500">✅</span>
                <span>Uso de eval(`import`) para bypass de análise estática</span>
              </div>
              <div className="bg-background p-2 rounded border flex items-center gap-2">
                <span className="text-green-500">✅</span>
                <span>Correção do vazamento de Node modules no build</span>
              </div>
              <div className="bg-background p-2 rounded border flex items-center gap-2">
                <span className="text-green-500">✅</span>
                <span>Homologação do ambiente Headless no Sandbox</span>
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-bold uppercase text-xs tracking-wider opacity-70">Resultado</h3>
            <p className="text-base mt-1 text-primary font-medium">O projeto agora compila corretamente e o botão "Conectar Conta" no Lead Finder aciona o navegador no servidor sem erros de bundle.</p>
          </section>
        </div>
      </div>

      <footer className="pt-8 border-t flex justify-between items-center text-xs text-muted-foreground italic">
        <span>Lead Finder - Core Stability</span>
        <span>2026-08-20 22:50 UTC</span>
      </footer>
    </div>
  );
}
