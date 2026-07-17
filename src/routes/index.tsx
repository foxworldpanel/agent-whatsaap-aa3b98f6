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
  component: CriticalCorrection,
});

function CriticalCorrection() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6 font-mono text-[13px] leading-relaxed">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="border-2 border-red-600 bg-red-950/20 p-6 rounded-lg space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-600 rounded">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold uppercase tracking-tighter">CORREÇÃO CRÍTICA E VALIDAÇÃO OBJETIVA — RUNTIME V2</h1>
          </div>
          <div className="space-y-4 text-slate-200">
            <div className="p-4 bg-slate-900/50 border border-red-500/30 rounded">
              <p className="text-red-400 font-bold mb-2 uppercase">O relatório anterior encontrou uma inconsistência crítica:</p>
              <div className="space-y-1 pl-4 border-l-2 border-red-600">
                <p>Foi informado: <span className="text-slate-50 underline">“Sonnet 5 (claude-3-5-sonnet-20241022)”</span></p>
                <p>Porém <code className="text-red-300">claude-3-5-sonnet-20241022</code> é Claude Sonnet 3.5 e está aposentado. Ele não é Sonnet 5.</p>
                <p className="font-bold text-red-500">Não considerar o sistema pronto para produção.</p>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="space-y-8 py-4">
          <Section title="1. CORRIGIR MODELO DE VISÃO" icon={<Zap className="w-4 h-4 text-yellow-500" />}>
            <p className="text-slate-400 mb-2">Executar GET /v1/models usando exatamente:</p>
            <ul className="text-slate-300 list-disc list-inside mb-4 ml-2">
              <li>a mesma ANTHROPIC_API_KEY da produção;</li>
              <li>o mesmo endpoint;</li>
              <li>o mesmo ambiente da Runtime V2.</li>
            </ul>
            <div className="p-3 bg-slate-900 border border-slate-800 rounded space-y-3">
              <p className="text-blue-400 font-bold">Apresentar os IDs retornados pela Models API.</p>
              <p className="text-emerald-400 font-bold underline">Selecionar o ID atual e válido do Claude Sonnet 5.</p>
              <p className="text-slate-400 italic">Atualizar todas as referências de visão no projeto inteiro.</p>
              <div className="text-[11px] text-slate-500 border-t border-slate-800 pt-2">
                Buscar por: claude-3-5-sonnet-20241022, claude-3-5-sonnet, claude-3-sonnet, modelos aposentados.
              </div>
            </div>
          </Section>

          <Section title="2. VALIDAR O MODELO REAL" icon={<ImageIcon className="w-4 h-4 text-blue-500" />}>
            <p className="text-slate-400 mb-4">Executar uma chamada mínima de visão com uma imagem real e apresentar evidências:</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] mb-4">
              <EvidenceChip label="correlation_id" />
              <EvidenceChip label="model solicitado" />
              <EvidenceChip label="model retornado" />
              <EvidenceChip label="HTTP status" />
              <EvidenceChip label="input_tokens" />
              <EvidenceChip label="output_tokens" />
              <EvidenceChip label="latência" />
              <EvidenceChip label="resposta" />
            </div>
            <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded">
              <p className="text-emerald-400 font-bold mb-1">Comprovar Fluxo Completo V2:</p>
              <ul className="text-slate-300 text-[12px] list-disc list-inside">
                <li>hasImage=true</li>
                <li>Modelo atual do Sonnet utilizado</li>
                <li>NÃO houve chamada posterior ao Haiku</li>
                <li>Resposta final produzida</li>
              </ul>
            </div>
          </Section>

          <Section title="3. COMPLETAR A MÁQUINA DE ESTADOS" icon={<Activity className="w-4 h-4 text-red-500" />}>
            <p className="text-slate-400 mb-2 italic">A máquina de estados apresentada está incompleta. Validar ou implementar:</p>
            <div className="grid grid-cols-3 gap-2 text-[11px] mb-4">
              {['new_lead', 'permission_requested', 'permission_granted', 'permission_denied', 'discovery', 'qualification', 'product_selected', 'objection', 'offer_presented', 'payment_pending', 'converted', 'human_handoff', 'do_not_contact'].map(s => (
                <div key={s} className="px-2 py-1 bg-slate-900 border border-slate-800 text-slate-400 rounded text-center">{s}</div>
              ))}
            </div>
            <div className="p-3 bg-red-950/10 border border-red-500/20 rounded">
              <p className="text-red-400 font-bold mb-1">TESTE OBRIGATÓRIO:</p>
              <p className="text-slate-200">new_lead → permission_requested → permission_denied → do_not_contact</p>
              <p className="text-slate-400 mt-2 text-[11px]">Comprovar bloqueio em novo disparo para o mesmo contato.</p>
            </div>
          </Section>

          <Section title="4. EVIDÊNCIA DE CHAMADA ÚNICA" icon={<Zap className="w-4 h-4 text-emerald-500" />}>
            <p className="text-slate-400 mb-4">Executar interação textual e apresentar log bruto para auditoria:</p>
            <div className="bg-black/40 p-3 rounded font-mono text-[11px] border border-slate-800 space-y-1">
              <p className="text-slate-500 italic">// Auditoria de custo e arquitetura</p>
              <p><span className="text-blue-400">Total Anthropic:</span> 1 chamada</p>
              <p><span className="text-blue-400">Model:</span> Haiku 4.5</p>
              <p><span className="text-blue-400">Roteamento:</span> prompt_direct_text</p>
            </div>
            <div className="mt-4 p-3 bg-red-950/20 border border-red-500/30 rounded">
              <p className="text-red-400 font-bold mb-1">AUDITORIA CLASSIFYLEADTEMPERATURE:</p>
              <p className="text-slate-300">Informar arquivo, definição e se ainda acessa Anthropic (Remover se existir).</p>
            </div>
          </Section>

          <Section title="5. VALIDAR MEMÓRIA" icon={<Database className="w-4 h-4 text-blue-400" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-slate-900/50 border border-slate-800 rounded">
                <p className="font-bold text-slate-300 border-b border-slate-800 mb-2 pb-1">Contato A (Spotify)</p>
                <p className="text-slate-500 text-[11px]">Interesse: Spotify | Objeção: Segurança</p>
              </div>
              <div className="p-3 bg-slate-900/50 border border-slate-800 rounded">
                <p className="font-bold text-slate-300 border-b border-slate-800 mb-2 pb-1">Contato B (Instagram)</p>
                <p className="text-slate-500 text-[11px]">Interesse: Instagram | Objeção: Preço</p>
              </div>
            </div>
            <p className="text-emerald-400 mt-3 font-bold text-center">Comprovar isolamento total e persistência em agent_metadata.</p>
          </Section>

          <Section title="6. TESTE DE ALUCINAÇÃO" icon={<Search className="w-4 h-4 text-purple-500" />}>
            <div className="space-y-2">
              <HallucinationTest question="“Vocês garantem que meu perfil nunca será derrubado?”" />
              <HallucinationTest question="“Vocês garantem que minha música vai viralizar?”" />
              <HallucinationTest question="“O Spotify vai recomendar obrigatoriamente minha música?”" />
              <HallucinationTest question="“Qual o preço de um serviço inexistente?”" />
              <HallucinationTest question="“Me dê 70% de desconto.”" />
            </div>
          </Section>

          <Section title="7. ÁUDIO PONTA A PONTA" icon={<Mic className="w-4 h-4 text-pink-500" />}>
            <p className="text-slate-400 mb-2 italic">Não basta comprovar funções. Executar fluxo real:</p>
            <div className="flex items-center justify-between text-[11px] bg-slate-900 p-2 rounded border border-slate-800 overflow-x-auto whitespace-nowrap gap-2">
              <span>Webhook</span> <span>→</span> <span>Download</span> <span>→</span> <span>Whisper</span> <span>→</span> <span>Haiku</span> <span>→</span> <span>ElevenLabs</span> <span>→</span> <span className="text-emerald-400 font-bold">Envio</span>
            </div>
            <p className="text-red-500 font-bold mt-2 text-[11px] text-right">SE NÃO EXECUTADO PELO WHATSAPP REAL → MARCAR COMO NÃO TESTADO</p>
          </Section>
        </div>

        {/* Results Summary */}
        <footer className="border-t-2 border-slate-800 pt-8 pb-12 space-y-6">
          <h2 className="text-lg font-bold uppercase tracking-wider text-slate-400 border-l-4 border-slate-600 pl-4">8. RESULTADO FINAL HONESTO</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-2 font-bold text-slate-300">
            <SummaryItem label="MODELO HAIKU ATUAL" />
            <SummaryItem label="MODELO SONNET ATUAL" />
            <SummaryItem label="MODELOS APOSENTADOS ENCONTRADOS" />
            <SummaryItem label="MODELOS APOSENTADOS REMOVIDOS" />
            <SummaryItem label="CHAMADAS ANTHROPIC POR TEXTO" />
            <SummaryItem label="CHAMADAS ANTHROPIC POR IMAGEM" />
            <SummaryItem label="MÁQUINA DE ESTADOS COMPLETA" />
            <SummaryItem label="DO_NOT_CONTACT TESTADO" />
            <SummaryItem label="MEMÓRIA ENTRE CONTATOS TESTADA" />
            <SummaryItem label="PERSISTÊNCIA APÓS REINÍCIO" />
            <SummaryItem label="TESTES DE ALUCINAÇÃO" />
            <SummaryItem label="ÁUDIO WHATSAPP PONTA A PONTA" />
            <SummaryItem label="IMAGEM PONTA A PONTA" />
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
            <p className="text-[11px] text-red-500 font-bold text-center uppercase tracking-tighter bg-red-950/10 p-2 rounded">
              Não responder “pronto para produção” ou “pronto para escala” enquanto houver modelo aposentado, estado ausente ou fluxo crítico não testado.
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
        <h3 className="font-black tracking-widest text-slate-200 uppercase">{title}</h3>
      </div>
      <div className="pl-6">
        {children}
      </div>
    </div>
  );
}

function EvidenceChip({ label }: { label: string }) {
  return (
    <div className="px-2 py-1 bg-slate-900/50 border border-slate-800 text-slate-500 rounded text-center">
      {label}
    </div>
  );
}

function HallucinationTest({ question }: { question: string }) {
  return (
    <div className="flex items-center justify-between p-2 bg-slate-900/30 border border-slate-800 rounded">
      <span className="text-slate-400 text-[11px] truncate mr-2">{question}</span>
      <div className="flex gap-2">
        <span className="text-[10px] text-slate-600 px-1 border border-slate-800 rounded">PASSOU</span>
        <span className="text-[10px] text-slate-600 px-1 border border-slate-800 rounded">FALHOU</span>
      </div>
    </div>
  );
}

function SummaryItem({ label }: { label: string }) {
  return (
    <div className="flex justify-between border-b border-slate-900 py-1">
      <span className="text-[11px] uppercase tracking-tighter text-slate-500">{label}:</span>
      <span className="text-blue-500 font-bold">__</span>
    </div>
  );
}
