import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ShieldCheck, 
  Terminal,
  Activity,
  History,
  Scale,
  Mic,
  ImageIcon,
  Zap,
  Cpu,
  FileText,
  AlertCircle,
  Database,
  Search,
  CheckCircle2,
  Layout,
  MessageSquare
} from "lucide-react";

export const Route = createFileRoute('/')({
  component: FinalValidation,
});

function FinalValidation() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6 font-mono text-[13px] leading-relaxed">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="border-2 border-red-600 bg-red-950/20 p-6 rounded-lg space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-600 rounded">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold uppercase tracking-tighter">VALIDAÇÃO FINAL DE RUNTIME V2 — SOMENTE EVIDÊNCIAS</h1>
          </div>
          <div className="space-y-2 text-red-200">
            <p className="font-bold underline">Não alterar código nesta etapa.</p>
            <p>A auditoria anterior apresentou conclusões, mas não demonstrou evidências suficientes para confirmar produção.</p>
            <p>Executar validação real e apresentar os resultados brutos.</p>
          </div>
        </header>

        {/* Content */}
        <div className="space-y-8 py-4">
          <Section title="1. COMPROVAR UMA ÚNICA CHAMADA DE LLM" icon={<Zap className="w-4 h-4" />}>
            <p className="text-slate-400 mb-4">Executar uma mensagem textual real. Apresentar o log completo do turno contendo:</p>
            <ul className="grid grid-cols-2 gap-x-8 gap-y-1 text-slate-300 list-disc list-inside ml-2">
              <li>correlation_id</li>
              <li>contato de teste anonimizado</li>
              <li>horário</li>
              <li>modelo escolhido</li>
              <li>motivo do roteamento</li>
              <li>quantidade total de chamadas Anthropic</li>
              <li>nomes das funções que realizaram chamadas externas</li>
              <li>input_tokens</li>
              <li>output_tokens</li>
              <li>latência</li>
              <li>resposta final</li>
            </ul>
            <div className="mt-4 p-3 bg-slate-900 border border-slate-800 rounded">
              <p className="text-blue-400 font-bold mb-1">BUSCA DE CÓDIGO (Anti-Regressão):</p>
              <p className="text-slate-400">Confirmar se <code className="text-slate-200">classifyLeadTemperature</code> ainda existe, é importada ou chamada. Não considerar comentários.</p>
            </div>
          </Section>

          <Section title="2. SAÍDA ESTRUTURADA DO HAIKU" icon={<Cpu className="w-4 h-4" />}>
            <p className="text-slate-400 mb-4">Mostrar a estrutura exata retornada pela chamada principal. Comprovar que uma única resposta contém:</p>
            <div className="grid grid-cols-2 gap-2 text-emerald-400 font-bold mb-4">
              <span>- customer_reply</span>
              <span>- lead_temperature</span>
              <span>- intent</span>
              <span>- sales_stage</span>
              <span>- product_interest</span>
              <span>- objection</span>
              <span>- needs_human</span>
              <span>- next_action</span>
            </div>
            <p className="text-slate-500 italic">Mostrar: schema, parser, validação, fallback em caso de JSON inválido e persistência.</p>
          </Section>

          <Section title="3. MÁQUINA DE ESTADOS" icon={<Activity className="w-4 h-4" />}>
            <p className="text-slate-400 mb-2">Listar todos os estados implementados e comprovar fluxos:</p>
            <div className="space-y-4">
              <div className="p-3 bg-slate-900/50 border border-slate-800 rounded">
                <p className="text-slate-200 font-bold mb-1">Fluxo A (Conversão):</p>
                <p className="text-emerald-500">new_lead → permission_requested → permission_granted → discovery → qualification → offer_presented → converted</p>
              </div>
              <div className="p-3 bg-slate-900/50 border border-slate-800 rounded">
                <p className="text-slate-200 font-bold mb-1">Fluxo B (Bloqueio):</p>
                <p className="text-red-400">new_lead → permission_requested → permission_denied → do_not_contact</p>
                <p className="text-slate-500 mt-1 text-[11px]">Após marcar do_not_contact, tentar novo disparo e comprovar bloqueio.</p>
              </div>
            </div>
          </Section>

          <Section title="4. MEMÓRIA E ISOLAMENTO" icon={<History className="w-4 h-4" />}>
            <p className="text-slate-400 mb-2">Mostrar onde a memória estruturada é salva (tabela, colunas, chaves). Comprovar:</p>
            <ul className="text-slate-300 space-y-1 list-disc list-inside ml-2">
              <li>Isolamento entre contatos (teste simultâneo)</li>
              <li>Comportamento após reinício de sessão</li>
              <li>Política de atualização e limite de histórico</li>
            </ul>
          </Section>

          <Section title="5. ROTEAMENTO DE MODELOS" icon={<Layout className="w-4 h-4" />}>
            <div className="grid grid-cols-2 gap-4">
              <RoutingExpected type="Texto" model="Haiku 4.5" />
              <RoutingExpected type="Objeção" model="Haiku 4.5" />
              <RoutingExpected type="Áudio" model="Whisper + Haiku 4.5" />
              <RoutingExpected type="Imagem" model="Sonnet 5" />
            </div>
          </Section>

          <Section title="6 & 7. TESTES REAIS (WHATSAPP)" icon={<MessageSquare className="w-4 h-4" />}>
            <div className="space-y-4">
              <div className="p-3 bg-slate-900/50 border border-slate-800 rounded">
                <p className="text-slate-200 font-bold mb-1">Ponta a Ponta Áudio:</p>
                <p className="text-slate-400">Webhook → Download → Whisper → Haiku → ElevenLabs → WhatsApp. Confirmar recebimento no aparelho.</p>
              </div>
              <div className="p-3 bg-slate-900/50 border border-slate-800 rounded">
                <p className="text-slate-200 font-bold mb-1">Ponta a Ponta Imagem:</p>
                <p className="text-slate-400">Webhook → Download → hasImage=true → Sonnet 5 → Resposta entregue. Comprovar ausência de chamada ao Haiku.</p>
              </div>
            </div>
          </Section>

          <Section title="8. VERACIDADE E ALUCINAÇÃO" icon={<Search className="w-4 h-4" />}>
            <p className="text-slate-400 mb-2">Executar perguntas críticas (Garantias, Viralização, Preços inexistentes, Descontos 70%).</p>
            <p className="text-slate-200 font-bold">O agente NÃO deve inventar, prometer resultados ou criar preços.</p>
          </Section>

          <Section title="9. REGRESSÃO" icon={<AlertCircle className="w-4 h-4" />}>
            <p className="text-slate-400 mb-2">Matriz de 14 casos: Texto, Imagem, Áudio, Recusa, DNC, Preço, Objeção, Fechamento, Transf. Humana, Falhas (Anthropic/OpenAI/ElevenLabs), Duplicatas.</p>
          </Section>

          <Section title="10. EVIDÊNCIAS DE TESTE" icon={<Terminal className="w-4 h-4" />}>
            <p className="text-slate-400">Diferenciar claramente: Unitário, Integração, Script, Webhook e Real WhatsApp. Não confundir scripts com canal real.</p>
          </Section>
        </div>

        {/* Results Summary */}
        <footer className="border-t-2 border-slate-800 pt-8 pb-12 space-y-6">
          <h2 className="text-lg font-bold uppercase tracking-wider text-slate-400">RESULTADO FINAL</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-2 font-bold text-slate-300">
            <SummaryItem label="CHAMADAS ANTHROPIC POR TURNO TEXTUAL" />
            <SummaryItem label="CLASSIFYLEADTEMPERATURE AINDA É CHAMADA" />
            <SummaryItem label="SAÍDA ESTRUTURADA VALIDADA" />
            <SummaryItem label="ESTADOS IMPLEMENTADOS" />
            <SummaryItem label="DO_NOT_CONTACT TESTADO" />
            <SummaryItem label="MEMÓRIA PERSISTENTE" />
            <SummaryItem label="ISOLAMENTO ENTRE CONTATOS" />
            <SummaryItem label="TEXTO REAL TESTADO" />
            <SummaryItem label="IMAGEM REAL TESTADA" />
            <SummaryItem label="ÁUDIO REAL TESTADO" />
            <SummaryItem label="ELEVENLABS PONTA A PONTA" />
            <SummaryItem label="TESTES DE ALUCINAÇÃO" />
            <SummaryItem label="REGRESSÕES" />
            <SummaryItem label="ITENS NÃO TESTADOS" />
          </div>
          
          <div className="flex flex-col gap-3 pt-6 border-t border-slate-900">
            <div className="flex justify-between items-center bg-slate-900 p-3 rounded">
              <span className="font-bold">PRONTO PARA TESTE CONTROLADO</span>
              <span className="text-slate-500">PENDENTE</span>
            </div>
            <div className="flex justify-between items-center bg-slate-900 p-3 rounded">
              <span className="font-extrabold text-lg text-emerald-500">PRONTO PARA DISPARO EM ESCALA</span>
              <span className="text-slate-500">PENDENTE</span>
            </div>
            <p className="text-[11px] text-slate-500 italic text-center">
              Somente responder “pronto para disparo em escala” se todos os fluxos críticos tiverem evidências reais de ponta a ponta.
            </p>
          </div>
        </footer>

      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string, icon: React.ReactNode, children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <span className="text-slate-500">{icon}</span>
        <h3 className="font-black tracking-widest text-slate-200">{title}</h3>
      </div>
      <div className="pl-6">
        {children}
      </div>
    </div>
  );
}

function RoutingExpected({ type, model }: { type: string, model: string }) {
  return (
    <div className="bg-slate-900/30 p-2 border border-slate-800 rounded flex justify-between items-center">
      <span className="text-slate-400">{type}:</span>
      <span className="text-emerald-400 font-bold">→ {model}</span>
    </div>
  );
}

function SummaryItem({ label }: { label: string }) {
  return (
    <div className="flex justify-between border-b border-slate-900 py-1">
      <span className="text-[11px] uppercase tracking-tighter text-slate-500">{label}:</span>
      <span className="text-blue-500">__</span>
    </div>
  );
}
