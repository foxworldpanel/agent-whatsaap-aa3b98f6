import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  return (
    <div className="p-8 font-sans max-w-4xl mx-auto space-y-8">
      <div className="bg-destructive/10 border-2 border-destructive p-6 rounded-xl text-destructive">
        <h1 className="text-2xl font-bold mb-2">CRITICAL: Instagram Connection is NOT working</h1>
        <p className="font-medium">tem que fazer funcionar a conexão do instagram no lead finder</p>
      </div>

      <div className="bg-muted p-6 rounded-xl border-2 border-primary/20">
        <h2 className="text-xl font-bold text-primary mb-4">BUG P0 – IMPLEMENTAR FLUXO FUNCIONAL DE CONEXÃO DO INSTAGRAM</h2>
        
        <div className="space-y-6 text-sm">
          <section>
            <h3 className="font-bold uppercase text-xs tracking-wider opacity-70">Problema</h3>
            <p className="text-base mt-1">O botão "Conectar Conta" no Lead Finder falha ao iniciar o fluxo real de autenticação ou não fornece feedback suficiente.</p>
          </section>

          <section className="grid md:grid-cols-2 gap-4">
            <div className="bg-background p-4 rounded border">
              <h4 className="font-bold mb-2 text-primary">Objetivo</h4>
              <ul className="space-y-1 text-xs">
                <li>1. Clicar em "Conectar Instagram"</li>
                <li>2. Iniciar navegador (Headed/Headless)</li>
                <li>3. Capturar StorageState após login</li>
                <li>4. Salvar credencial no banco</li>
                <li>5. Status = <strong>CONNECTED</strong></li>
              </ul>
            </div>
            <div className="bg-background p-4 rounded border">
              <h4 className="font-bold mb-2 text-primary">Critérios de Aceite</h4>
              <ul className="space-y-1 text-xs">
                <li>✅ Feedback visual em cada etapa</li>
                <li>✅ Erros técnicos claros expostos na UI</li>
                <li>✅ Atualização automática da lista</li>
                <li>✅ Logs de telemetria completos</li>
              </ul>
            </div>
          </section>

          <section className="bg-primary/5 p-4 rounded border border-primary/20">
            <h3 className="font-bold uppercase text-xs tracking-wider opacity-70">Modo de Operação</h3>
            <p className="mt-2 font-medium">Esta é uma tarefa de <strong>IMPLEMENTAÇÃO PURA</strong>. Não atualize documentação, README ou Roadmaps. Foque em fazer o código funcionar de ponta a ponta.</p>
          </section>
        </div>
      </div>

      <footer className="pt-8 border-t flex justify-between items-center text-xs text-muted-foreground italic">
        <span>Minha avaliação</span>
        <span>2026-08-20</span>
      </footer>
    </div>
  );
}
