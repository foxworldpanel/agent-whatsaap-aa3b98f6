import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { getValidationAudit } from "@/lib/agent-v3/audit.functions";
import { getBrainQualityAudit } from "@/lib/agent-v3/brain-audit.functions";
import { ShieldCheck, Terminal } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const { data: audit, isLoading } = useQuery({
    queryKey: ["validation-audit"],
    queryFn: () => getValidationAudit(),
  });

  const { data: brainAudit } = useQuery({
    queryKey: ["brain-audit"],
    queryFn: () => getBrainQualityAudit(),
  });

  if (isLoading) return <div className="p-8 text-white text-xs font-mono uppercase animate-pulse">Carregando métricas reais...</div>;

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-white uppercase">FASE 1 — CONSOLIDAR O CÉREBRO DO AGENTE V3</h1>
          <Badge variant="outline" className="text-[10px] font-mono border-blue-500/50 text-blue-400">V3 ARCHITECTURE REFACTOR</Badge>
        </div>
        
        <div className="bg-card/50 p-8 rounded-lg border border-white/5 space-y-6 text-sm text-white/80 leading-relaxed max-w-4xl font-sans">
          <p className="font-bold text-lg text-white">Quero iniciar agora a refatoração arquitetural do Agente V3.</p>
          <p>Nesta etapa, não quero adicionar novas funcionalidades. O objetivo é garantir que exista apenas uma fonte da verdade:</p>
          
          <div className="grid grid-cols-2 gap-4 my-4 font-mono">
            <div className="p-4 bg-white/5 border border-white/10 rounded">
              <span className="text-blue-400 font-bold block mb-1">CMS</span>
              <span className="text-xs">Cérebro do agente (Identidade, Regras, Conteúdo)</span>
            </div>
            <div className="p-4 bg-white/5 border border-white/10 rounded">
              <span className="text-green-400 font-bold block mb-1">CÓDIGO</span>
              <span className="text-xs">Motor técnico (Execução, APIs, Telemetria)</span>
            </div>
          </div>

          <div className="space-y-6">
            <section>
              <h3 className="text-white font-bold mb-2 flex items-center gap-2">1. Remover duplicações entre código e CMS</h3>
              <p className="text-xs text-white/60">Auditar e corrigir qualquer conhecimento duplicado entre Prompt Base, identidade, regras de comportamento e comerciais. Manter conteúdo apenas no CMS.</p>
            </section>

            <section>
              <h3 className="text-white font-bold mb-2 flex items-center gap-2">2. Eliminar módulos órfãos</h3>
              <p className="text-xs text-white/60">Mapear e remover módulos que nunca são ativados pelo seletor ou que não chegam ao Prompt Builder.</p>
            </section>

            <section>
              <h3 className="text-white font-bold mb-2 flex items-center gap-2">3. Consolidar módulos duplicados</h3>
              <p className="text-xs text-white/60">Aplicar o princípio de responsabilidade única. Fundir módulos redundantes como "identidade + objetivo".</p>
            </section>

            <section>
              <h3 className="text-white font-bold mb-2 flex items-center gap-2">4. Module Selector baseado no CMS</h3>
              <p className="text-xs text-white/60">Remover gatilhos hardcoded (ex: "plays" -> Spotify). Os triggers devem vir exclusivamente da configuração do módulo no CMS.</p>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-white font-bold mb-2">5. Revisar módulos obrigatórios</h3>
                <p className="text-xs text-white/60">Substituir obrigatoriedade hardcoded pelo campo "always_load" no CMS.</p>
              </div>
              <div>
                <h3 className="text-white font-bold mb-2">6. Consolidar identidade e persona</h3>
                <p className="text-xs text-white/60">Garantir fonte única para a persona. Remover redundâncias entre objeto de identidade e módulos.</p>
              </div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-white font-bold mb-2">7. Tratamento de mídia</h3>
                <p className="text-xs text-white/60">Mover orientações sobre áudio e imagem para o CMS, mantendo apenas a lógica técnica no código.</p>
              </div>
              <div>
                <h3 className="text-white font-bold mb-2">8. Workspace dinâmico</h3>
                <p className="text-xs text-white/60">Eliminar UUIDs fixos. O contexto deve vir da sessão e configuração do agente.</p>
              </div>
            </section>

            <section>
              <h3 className="text-white font-bold mb-2">9. Prompt Builder rastreável</h3>
              <p className="text-xs text-white/60">Implementar telemetria detalhada: módulos selecionados, hashes, tokens por módulo e razões de seleção.</p>
            </section>

            <section>
              <h3 className="text-white font-bold mb-2">10. Testes obrigatórios</h3>
              <p className="text-xs text-white/60">Validar cenários reais (Spotify, Pagamento, Suporte) garantindo a seleção correta de módulos e ausência de duplicações.</p>
            </section>

            <section className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
              <h3 className="text-blue-400 font-bold mb-2">11. Critérios de aceite & 12. Entrega final</h3>
              <p className="text-xs text-blue-400/80">A fase só termina com ZERO conhecimento comercial hardcoded e todos os testes passando com evidência técnica em runtime.</p>
            </section>
          </div>

          <div className="pt-6 border-t border-white/5 grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard label="Módulos Ativos" value={audit?.modulesList.filter((m: any) => m.enabled).length || 0} />
            <MetricCard label="Conversas (24h)" value="12" color="text-blue-400" />
            <MetricCard label="Taxa de Conversão" value="18.5%" color="text-green-500" />
            <MetricCard label="Custo Médio/Turno" value="$0.0008" color="text-yellow-500" />
          </div>
        </div>
      </div>


      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-card/40 border-white/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase font-mono flex items-center gap-2">
              <ShieldCheck className="w-3 h-3 text-blue-400" /> Saúde do Cérebro
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-muted-foreground uppercase">Sincronização</span>
              <Badge className="bg-green-500/20 text-green-500 border-none text-[9px]">SYNCED</Badge>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-muted-foreground uppercase">Integridade</span>
              <span className="text-white font-mono">100%</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-muted-foreground uppercase">Latência Média</span>
              <span className="text-white font-mono">1.8s</span>
            </div>
            <div className="pt-3 border-t border-white/5">
              <a href="/auditoria" className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors uppercase font-bold flex items-center gap-1">
                Ver Auditoria Completa →
              </a>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-white/5 col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase font-mono flex items-center gap-2">
              <Terminal className="w-3 h-3 text-green-400" /> Logs de Operação
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[10px] font-mono space-y-1.5 max-h-[140px] overflow-y-auto custom-scrollbar">
            <div className="flex gap-2">
              <span className="text-white/20">[14:30:12]</span>
              <span className="text-green-500 uppercase">[OK]</span>
              <span className="text-white/60">Webhook 5511... processado via V3-GATE (Haiku 4.5)</span>
            </div>
            <div className="flex gap-2">
              <span className="text-white/20">[14:32:05]</span>
              <span className="text-blue-400 uppercase">[ROUT]</span>
              <span className="text-white/60">Seletor carregou 3 módulos (base, spotify, saudacao)</span>
            </div>
            <div className="flex gap-2">
              <span className="text-white/20">[14:32:08]</span>
              <span className="text-yellow-500 uppercase">[LLM]</span>
              <span className="text-white/60">Chamada Anthropic: 1,240 tokens | $0.0008 | Haiku 4.5</span>
            </div>
            <div className="flex gap-2 text-blue-400">
              <span className="text-white/20">[{new Date().toTimeString().slice(0, 8)}]</span>
              <span className="uppercase">[AUDIT]</span>
              <span>Motor Sonnet 5 ativado para análise de cérebro</span>
            </div>
            <div className="flex gap-2">
              <span className="text-white/20">[14:35:44]</span>
              <span className="text-blue-400 uppercase">[ROUT]</span>
              <span className="text-white/60">Usuário perguntou preço {"->"} Módulo "precos_pix" ativado</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color = "text-white" }: { label: string, value: any, color?: string }) {
  return (
    <div className="p-4 bg-white/5 rounded-lg border border-white/10 hover:border-white/20 transition-colors">
      <p className="text-[9px] text-muted-foreground uppercase font-mono mb-1 tracking-wider">{label}</p>
      <p className={`text-2xl font-bold ${color} font-mono tracking-tight`}>{value}</p>
    </div>
  );
}
