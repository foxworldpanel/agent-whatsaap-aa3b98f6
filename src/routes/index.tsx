import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Bot, 
  Cpu, 
  Mic, 
  Image as ImageIcon, 
  ShieldCheck, 
  Zap, 
  Clock, 
  DollarSign, 
  FileText, 
  Layers, 
  Settings2, 
  ArrowRight,
  Database,
  Search,
  MessageSquare,
  Target,
  Workflow,
  ClipboardList,
  CheckCircle2
} from "lucide-react";

export const Route = createFileRoute('/')({
  component: OptimizationPlan,
});

function OptimizationPlan() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <header className="space-y-4 border-b border-slate-800 pb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Workflow className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">IMPLEMENTAÇÃO DE OTIMIZAÇÃO DA ARQUITETURA DE IA — RUNTIME V2</h1>
            </div>
            <Badge variant="outline" className="text-blue-400 border-blue-400 px-3 py-1">
              STATUS: AGUARDANDO EXECUÇÃO
            </Badge>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-lg">
            <h2 className="text-sm font-bold uppercase tracking-widest text-blue-400 mb-2">Objetivo:</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Aprimorar a Runtime V2 para maximizar qualidade comercial, conversão, consistência, economia, velocidade, controle do fluxo e segurança nas informações.
            </p>
          </div>
        </header>

        {/* Content Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Plan Column */}
          <div className="lg:col-span-2 space-y-8">
            
            <section className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-blue-400" />
                <h2 className="text-xl font-semibold uppercase tracking-wider text-slate-200">Arquitetura Aprovada</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ArchitectureCard 
                  title="Texto / Vendas / Suporte" 
                  model="Claude Haiku 4.5" 
                  description="Padrão para todas as conversas comuns."
                />
                <ArchitectureCard 
                  title="Visão / Documentos" 
                  model="Claude Sonnet 5" 
                  description="Apenas para análise visual complexa."
                />
                <ArchitectureCard 
                  title="Transcrição de Áudio" 
                  model="OpenAI Whisper" 
                  description="Conversão fiel de voz para texto."
                />
                <ArchitectureCard 
                  title="Síntese de Voz" 
                  model="ElevenLabs" 
                  description="Resposta em áudio humanizada."
                />
              </div>
            </section>

            <section className="space-y-6">
              <SectionHeader number="1" title="ELIMINAR CHAMADA DUPLA DE CLASSIFICAÇÃO" />
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                <p className="text-sm text-slate-400 italic">
                  Atualmente, classifyLeadTemperature gera uma segunda chamada à Anthropic.
                </p>
                <div className="bg-slate-950 p-4 rounded border border-blue-500/20">
                  <p className="text-blue-400 font-bold text-xs uppercase mb-2">Ação:</p>
                  <p className="text-sm text-slate-300">
                    Alterar para que a chamada principal do Haiku gere, em uma única execução estruturada:
                  </p>
                  <ul className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                    <li className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> Resposta ao cliente</li>
                    <li className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> Temperatura do lead</li>
                    <li className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> Intenção</li>
                    <li className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> Estágio comercial</li>
                    <li className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> Produto de interesse</li>
                    <li className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-500" /> Objeção detectada</li>
                  </ul>
                </div>
              </div>

              <SectionHeader number="2" title="ROTEAMENTO DOS MODELOS" />
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-500 uppercase">Regras Determinísticas</p>
                    <div className="text-sm space-y-1">
                      <p className="flex justify-between"><span>Texto/Comercial:</span> <span className="text-blue-400">Haiku 4.5</span></p>
                      <p className="flex justify-between"><span>Áudio Transcrito:</span> <span className="text-blue-400">Haiku 4.5</span></p>
                      <p className="flex justify-between"><span>Imagem/Vision:</span> <span className="text-purple-400">Sonnet 5</span></p>
                    </div>
                  </div>
                  <div className="p-3 bg-red-950/20 border border-red-500/20 rounded">
                    <p className="text-red-400 font-bold text-[10px] uppercase">Restrição:</p>
                    <p className="text-[11px] text-slate-400">Não permitir promoção subjetiva do Haiku para Sonnet. Registrar motivo, mídia, tokens e custo em log.</p>
                  </div>
                </div>
              </div>

              <SectionHeader number="3" title="MÁQUINA DE ESTADOS COMERCIAL" />
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <div className="flex flex-wrap gap-2">
                  {['new_lead', 'discovery', 'qualification', 'product_selected', 'objection', 'offer_presented', 'payment_pending', 'converted', 'human_handoff'].map(state => (
                    <Badge key={state} variant="secondary" className="bg-slate-800 text-slate-400 text-[10px]">{state}</Badge>
                  ))}
                </div>
                <p className="mt-4 text-xs text-slate-500 leading-relaxed">
                  O agente deve responder de acordo com o estágio atual. Não reiniciar abordagem nem repetir ofertas.
                </p>
              </div>

              <SectionHeader number="6" title="BASE COMERCIAL E VERACIDADE" />
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-green-500 shrink-0 mt-1" />
                  <div>
                    <p className="text-sm font-bold text-slate-200">Proibição de Alucinação:</p>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Não inventar preços, prazos, garantias ou disponibilidade. Não prometer viralização ou monetização. 
                      Se a informação estiver ausente: verificar ou transferir para humano.
                    </p>
                  </div>
                </div>
              </div>

              <SectionHeader number="10" title="TRANSFERÊNCIA HUMANA" />
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                <p className="text-xs text-slate-500 mb-3">Gatilhos de transferência:</p>
                <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-400 list-disc list-inside">
                  <li>Informação ausente</li>
                  <li>Ameaça jurídica</li>
                  <li>Reclamação grave</li>
                  <li>Cliente irritado</li>
                  <li>Solicitação fora do escopo</li>
                  <li>Falha técnica persistente</li>
                </ul>
              </div>
            </section>
          </div>

          {/* Sidebar Info */}
          <div className="space-y-8">
            <Card className="bg-slate-900 border-slate-800 text-slate-50">
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <Settings2 className="w-4 h-4" /> Estilo de Atendimento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs text-slate-500">
                <p>• Português brasileiro natural</p>
                <p>• Mensagens curtas</p>
                <p>• Uma pergunta por mensagem</p>
                <p>• Linguagem comercial sem pressão</p>
                <p>• Evitar jargão técnico</p>
              </CardContent>
            </Card>

            <Card className="bg-blue-600/10 border-blue-500/30 text-slate-50">
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-widest text-blue-400 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" /> Critérios de Aceite
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-[11px] text-slate-400">
                <div className="flex gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1 shrink-0" />
                  <p>Chamada única de LLM por turno textual.</p>
                </div>
                <div className="flex gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1 shrink-0" />
                  <p>Haiku processando 100% de textos/vendas.</p>
                </div>
                <div className="flex gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1 shrink-0" />
                  <p>Sonnet restrito a processamento de imagens.</p>
                </div>
                <div className="flex gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1 shrink-0" />
                  <p>Estado comercial persistido corretamente.</p>
                </div>
                <div className="flex gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1 shrink-0" />
                  <p>Logs comprovando roteamento e custos.</p>
                </div>
              </CardContent>
            </Card>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <h3 className="text-[10px] font-bold uppercase text-slate-500 mb-4 tracking-tighter">Entrega Final Esperada</h3>
              <div className="space-y-1 text-[10px] font-mono text-slate-400">
                <p>ARQUITETURA IMPLEMENTADA</p>
                <p>ARQUIVOS ALTERADOS</p>
                <p>FUNÇÕES ALTERADAS</p>
                <p>MÁQUINA DE ESTADOS</p>
                <p>EVIDÊNCIAS DE RUNTIME</p>
                <p>RECONCILIAÇÃO DE CUSTOS</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <footer className="pt-8 border-t border-slate-800 flex justify-center">
          <button className="group flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-xl font-bold transition-all shadow-xl shadow-blue-900/20 scale-100 hover:scale-105 active:scale-95">
            <Zap className="w-6 h-6 fill-current" />
            EXECUTAR OTIMIZAÇÃO V2 AGORA
          </button>
        </footer>

      </div>
    </div>
  );
}

function ArchitectureCard({ title, model, description }: { title: string, model: string, description: string }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-lg space-y-2">
      <p className="text-[10px] font-bold text-slate-500 uppercase">{title}</p>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-blue-500" />
        <p className="text-sm font-bold text-slate-100">{model}</p>
      </div>
      <p className="text-xs text-slate-400">{description}</p>
    </div>
  );
}

function SectionHeader({ number, title }: { number: string, title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex items-center justify-center w-8 h-8 rounded bg-slate-800 text-blue-400 font-bold text-sm border border-slate-700">
        {number}
      </span>
      <h3 className="text-lg font-bold text-slate-300 uppercase tracking-tight">{title}</h3>
    </div>
  );
}
