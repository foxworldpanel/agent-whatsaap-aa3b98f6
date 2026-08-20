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
            <p className="text-base mt-1">O build local está passando com sucesso, indicando que o isolamento do Playwright funcionou. O erro no preview da publicação pode estar relacionado a dependências de runtime específicas do ambiente de deployment da Lovable Cloud.</p>
          </section>

          <section>
            <h3 className="font-bold uppercase text-xs tracking-wider opacity-70">Próximos Passos</h3>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>Verificar logs de deployment na Lovable Cloud.</li>
              <li>Ajustar imports dinâmicos para maior compatibilidade com o ambiente de produção.</li>
              <li>Validar se o executável do Chromium está disponível no caminho configurado no servidor de produção.</li>
            </ul>
          </section>
        </div>
      </div>

      <footer className="pt-8 border-t flex justify-between items-center text-xs text-muted-foreground italic">
        <span>Lead Finder - Diagnóstico de Publicação</span>
        <span>2026-08-20 22:52 UTC</span>
      </footer>
    </div>
  );
}
