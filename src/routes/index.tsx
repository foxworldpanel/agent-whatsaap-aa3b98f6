import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  return (
    <div className="p-8 font-sans max-w-4xl mx-auto space-y-8">
      <div className="bg-red-500/10 border-2 border-red-500 p-6 rounded-xl text-red-700 dark:text-red-400">
        <h1 className="text-2xl font-bold mb-4">BUG CRÍTICO DE BUILD</h1>
        <div className="space-y-4 text-sm font-medium leading-relaxed">
          <p>O projeto NÃO pode depender diretamente de Playwright.</p>
          <p>O build está falhando com: <strong>Rolldown failed to resolve import "chromium-bidi/lib/cjs/bidiMapper/BidiMapper"</strong></p>
          <p>Isso demonstra que Playwright ainda está sendo analisado pelo bundler.</p>
          
          <div className="bg-background/50 p-4 rounded-lg border border-red-500/20">
            <p className="font-bold mb-2">NÃO tente esconder Playwright usando:</p>
            <ul className="list-disc pl-5 space-y-1 opacity-80">
              <li>dynamic import</li>
              <li>eval</li>
              <li>Function()</li>
              <li>imports ofuscados</li>
              <li>arquivos .server.ts</li>
            </ul>
          </div>
          
          <p className="font-bold">Essas abordagens continuam quebrando o build.</p>
        </div>
      </div>

      <div className="bg-muted p-6 rounded-xl border-2 border-primary/20 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-primary mb-4 uppercase tracking-tight">Objetivo</h2>
          <p className="text-sm">Remover COMPLETAMENTE qualquer dependência de Playwright deste projeto.</p>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono bg-background/50 p-4 rounded border">
          <span className="opacity-70">playwright</span>
          <span className="opacity-70">playwright-core</span>
          <span className="opacity-70">chromium</span>
          <span className="opacity-70">chromium-bidi</span>
          <span className="opacity-70">browser launch</span>
          <span className="opacity-70">browser context</span>
          <span className="opacity-70">storageState</span>
        </div>

        <div>
          <h3 className="font-bold text-sm mb-3">Arquitetura Obrigatória</h3>
          <div className="flex flex-col items-center gap-2 text-xs font-bold text-primary/80 bg-primary/5 p-4 rounded-lg">
            <span>Lead Finder</span>
            <span>↓</span>
            <span>InstagramAutomationClient</span>
            <span>↓</span>
            <span>HTTP API</span>
            <span>↓</span>
            <span>Worker Node Externo</span>
            <span>↓</span>
            <span>Playwright</span>
            <span>↓</span>
            <span>Instagram</span>
          </div>
        </div>

        <div className="text-sm space-y-2">
          <p className="font-bold">O Lead Finder deverá apenas:</p>
          <ul className="list-disc pl-5 opacity-80">
            <li>cadastrar contas</li>
            <li>solicitar conexão</li>
            <li>consultar status</li>
            <li>validar sessão</li>
            <li>iniciar jobs</li>
          </ul>
          <p className="mt-4 italic">Todas essas ações deverão ser chamadas HTTP para um serviço externo.</p>
        </div>
      </div>

      <footer className="pt-8 border-t flex flex-col items-center gap-2 text-xs text-muted-foreground italic">
        <p>O build deverá publicar normalmente sem qualquer referência ao chromium-bidi.</p>
        <p>2026-08-20 23:00 UTC</p>
      </footer>
    </div>
  );
}
