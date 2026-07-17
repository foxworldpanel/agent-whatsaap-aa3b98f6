/* dashboard nao esta abrindo */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: DecommissioningLanding,
});

function DecommissioningLanding() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redireciona para o dashboard principal
    navigate({ to: "/conversas" });

  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-red-100 p-2 text-red-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 whitespace-pre-wrap leading-relaxed">
              A PARTIR DE AGORA, NÃO ALTERE MAIS A INTERFACE DO PRODUTO.
              Não altere:
              - src/routes/index.tsx
              - dashboard
              - home
              - cards
              - banners
              - textos
              - checklists
              - páginas de acompanhamento
              
              A HOME DEVE VOLTAR A SER A INTERFACE NORMAL DO SISTEMA.
              NÃO IMPLEMENTAR MAIS PAINÉIS DE STATUS.
              
              ==================================================
              O objetivo agora é apenas validar a arquitetura.
              Para cada mudança realizada, apresentar evidências técnicas sem modificar a UI.
              Quero somente:
              1. Arquivos realmente alterados.
              2. Diff resumido.
              3. Migrations executadas.
              4. SQL aplicado.
              5. Resultado do build.
              6. Resultado dos testes.
              7. Logs relevantes.
              8. Evidências de runtime.
              
              ==================================================
              EXECUTAR APENAS ESTA AUDITORIA FINAL:
              ✓ confirmar que existe apenas 1 workspace;
              ✓ confirmar que somente a Mind permanece;
              ✓ confirmar que o runtime utiliza exclusivamente runAgentV2Turn();
              ✓ confirmar que não existe nenhuma referência restante à V1;
              ✓ confirmar que nenhuma tela cria ou troca workspace;
              ✓ confirmar que o WhatsApp responde normalmente;
              ✓ confirmar que o catálogo funciona;
              ✓ confirmar que o Analytics grava normalmente;
              ✓ confirmar que o projeto compila sem warnings críticos.
              
              ==================================================
              NO FINAL RESPONDER SOMENTE COM:
              WORKSPACE ÚNICO: SIM/NÃO
              RUNTIME EXCLUSIVAMENTE V2: SIM/NÃO
              REFERÊNCIAS À V1 ENCONTRADAS:(lista)
              BUILD:OK/FALHA
              TESTES:OK/FALHA
              PENDÊNCIAS:(lista)
              PRONTO PARA PRODUÇÃO:SIM/NÃO
              
              ==================================================
              NÃO ALTERAR MAIS A HOME.
              NÃO ESCREVER NOVOS CHECKLISTS.
              NÃO MODIFICAR A INTERFACE.
              APENAS VALIDAR E APRESENTAR EVIDÊNCIAS.
            </h1>
          </div>
          <div className="flex items-center gap-4 border-t pt-4">
            <Link to="/conversas">
              <Button size="lg" className="font-bold">
                Acessar Operação V2 <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </header>

        <footer className="text-center text-xs text-slate-400">
          ZapAgent Decommissioning Utility · Version 1.0.0-beta · July 2026
        </footer>
      </div>
    </div>
  );
}
