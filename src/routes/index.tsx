import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  MessageSquare
} from "lucide-react";

export const Route = createFileRoute('/')({
  component: AuditDashboard,
});

function AuditDashboard() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <header className="space-y-4 border-b border-slate-800 pb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <ShieldCheck className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Auditoria de Arquitetura IA - Runtime V2</h1>
            </div>
            <Badge variant="outline" className="text-blue-400 border-blue-400 px-3 py-1">
              ESTADO ATUAL: V2-ONLY (RUNTIME BLOQUEADA PARA V1)
            </Badge>
          </div>
          <p className="text-slate-400 max-w-3xl leading-relaxed">
            Relatório técnico factual baseado na análise direta do código fonte do projeto. 
            Não é um plano ou simulação; é a realidade atual da implementação do Agente Mind SMM.
          </p>
        </header>

        {/* Section 1: Inventário das IAs */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-semibold uppercase tracking-wider text-slate-300">1. Inventário das IAs Ativas</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <IAItem 
              name="Cérebro Principal (Chat)"
              provider="Anthropic"
              model="claude-haiku-4-5-20251001"
              purpose="Interação conversacional, extração de intenções e respostas comerciais."
              files="llm-client.server.ts, orchestrator.ts"
              api="https://api.anthropic.com/v1/messages"
            />
            <IAItem 
              name="Visão e Análise (Vision)"
              provider="Anthropic"
              model="claude-sonnet-5"
              purpose="Análise de screenshots do painel para guiar o cliente passo-a-passo."
              files="ai-services.server.ts, model-router.ts"
              api="https://api.anthropic.com/v1/messages"
            />
            <IAItem 
              name="Transcrição (STT)"
              provider="OpenAI"
              model="whisper-1"
              purpose="Conversão de áudio enviado pelo WhatsApp em texto para o agente."
              files="ai-services.server.ts"
              api="https://api.openai.com/v1/audio/transcriptions"
            />
            <IAItem 
              name="Voz (TTS)"
              provider="ElevenLabs"
              model="eleven_multilingual_v2"
              purpose="Geração de áudio para respostas rápidas e humanizadas (se configurado)."
              files="ai-services.server.ts"
              api="https://api.elevenlabs.io/v1/text-to-speech"
            />
            <IAItem 
              name="Classificador de Lead"
              provider="Anthropic"
              model="claude-haiku-4-5-20251001"
              purpose="Avalia se o lead é 'quente', 'morno' ou 'frio' base no histórico."
              files="ai-services.server.ts"
              api="https://api.anthropic.com/v1/messages"
            />
          </div>
        </section>

        {/* Section 2: Fluxo Real do Turno */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-yellow-400" />
            <h2 className="text-xl font-semibold uppercase tracking-wider text-slate-300">2. Fluxo Real de Conversa (V2)</h2>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 overflow-x-auto">
            <div className="flex items-center justify-between min-w-[1000px] gap-4">
              <Step icon={<MessageSquare />} label="Mensagem" sub="WhatsApp" />
              <ArrowRight className="text-slate-700" />
              <Step icon={<Search />} label="Router" sub="Módulos" />
              <ArrowRight className="text-slate-700" />
              <Step icon={<Settings2 />} label="Builder" sub="System Prompt" />
              <ArrowRight className="text-slate-700" />
              <Step icon={<Cpu />} label="LLM" sub="Haiku 4.5" />
              <ArrowRight className="text-slate-700" />
              <Step icon={<ShieldCheck />} label="Guard" sub="Filtros" />
              <ArrowRight className="text-slate-700" />
              <Step icon={<Database />} label="Persistência" sub="Conversas V2" />
              <ArrowRight className="text-slate-700" />
              <Step icon={<Zap />} label="Resposta" sub="WhatsApp" />
            </div>
          </div>
        </section>

        {/* Section 3: Auditoria Técnica Detalhada */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          <Card className="bg-slate-900 border-slate-800 text-slate-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Cpu className="w-5 h-5 text-blue-400" /> 3. Escolha do Modelo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-400">
              <div className="p-3 bg-slate-800/50 rounded border border-slate-700">
                <p className="text-slate-200 font-medium mb-1">Cenário Atual:</p>
                <p>100% das mensagens via chat utilizam o modelo <strong>Haiku 4.5</strong> para controle de custos e latência.</p>
              </div>
              <div className="p-3 bg-slate-800/50 rounded border border-slate-700">
                <p className="text-slate-200 font-medium mb-1">Escalonamento Automático:</p>
                <p><strong>DESATIVADO.</strong> O código em `model-router.ts` contém um bloqueio explícito (override) que impede a promoção para Sonnet mesmo em casos complexos para evitar estouro de orçamento.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 text-slate-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mic className="w-5 h-5 text-purple-400" /> 4. Áudio e Transcrição
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-400">
              <p>Ao receber áudio, o sistema chama a função `transcribeAudioUrl` que utiliza <strong>OpenAI Whisper-1</strong>.</p>
              <p>O texto transcrito é enviado ao <strong>Haiku 4.5</strong> para gerar a resposta textual.</p>
              <p>A resposta é enviada via texto no WhatsApp (TTS da ElevenLabs está implementado, mas o envio de áudio final está inativo por padrão).</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 text-slate-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ImageIcon className="w-5 h-5 text-green-400" /> 5. Imagem e Visão
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-400">
              <p>Imagens são roteadas para o modelo <strong>claude-sonnet-5</strong> via `describePanelScreen`.</p>
              <p>O `model-router.ts` detecta `hasImage` e seleciona obrigatoriamente o modelo Vision (Sonnet) para análise de contexto visual.</p>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800 text-slate-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="w-5 h-5 text-red-400" /> 6. Chamadas Duplas e Desperdício
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-400">
              <div className="flex gap-2 items-start text-red-300">
                <Zap className="w-4 h-4 mt-0.5 shrink-0" />
                <p><strong>Atenção:</strong> Identificada chamada ao Classificador de Lead (`classifyLeadTemperature`) em paralelo ao turno principal, gerando +1 chamada por mensagem.</p>
              </div>
              <p><strong>Desperdício de Contexto:</strong> O histórico enviado é limitado a 6 mensagens fixas. O sistema não utiliza resumo (summary) ativo no prompt, o que economiza tokens de entrada mas pode perder contexto em conversas longas.</p>
            </CardContent>
          </Card>

        </div>

        {/* Financial Section */}
        <section className="bg-blue-600/10 border border-blue-500/30 rounded-xl p-8 space-y-6">
          <div className="flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-semibold uppercase tracking-wider text-slate-100">7. Simulação Financeira (Haiku 4.5 vs Sonnet)</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div className="space-y-4">
              <p className="text-slate-400 text-sm">Base: 1.000 atendimentos (Méd. 10 mensagens/cada)</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Opção A: 100% Sonnet</span>
                  <span className="font-mono text-red-400">US$ 45.00</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Opção B: 100% Haiku 4.5 (ATUAL)</span>
                  <span className="font-mono text-green-400">US$ 3.80</span>
                </div>
                <div className="pt-2 border-t border-slate-700 flex justify-between font-bold text-blue-400">
                  <span>ECONOMIA ATUAL</span>
                  <span>91.5%</span>
                </div>
              </div>
            </div>
            <div className="bg-slate-950/50 p-4 rounded border border-slate-700 text-xs space-y-2">
              <p className="text-blue-400 font-bold uppercase tracking-tighter">Conclusão Técnica</p>
              <p className="text-slate-400 leading-relaxed italic">
                "A estratégia de forçar Haiku 4.5 para conversas de texto é a melhor escolha comercial. O ganho de qualidade do Sonnet em perguntas simples (preço/tutorial) não justifica o custo 12x maior."
              </p>
            </div>
          </div>
        </section>

        {/* Architecture Comparison */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-5 h-5 text-slate-400" />
            <h2 className="text-xl font-semibold uppercase tracking-wider text-slate-300">8. Arquitetura Atual vs Recomendada</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-slate-800 rounded-xl overflow-hidden">
            <div className="bg-slate-900/50 p-6 border-r border-slate-800">
              <h3 className="font-bold text-slate-400 mb-4 uppercase text-xs tracking-widest">Estado Atual (V2)</h3>
              <ul className="space-y-3 text-sm text-slate-300">
                <li className="flex gap-2">✅ Modelo Único (Haiku 4.5)</li>
                <li className="flex gap-2">✅ Guard Engine Determinístico</li>
                <li className="flex gap-2">✅ Single-Tenant (Mind Only)</li>
                <li className="flex gap-2 text-yellow-400">⚠️ Chamada extra de classificação</li>
                <li className="flex gap-2 text-yellow-400">⚠️ Histórico fixo (sem resumo)</li>
              </ul>
            </div>
            <div className="bg-slate-900 p-6">
              <h3 className="font-bold text-blue-400 mb-4 uppercase text-xs tracking-widest">Recomendação Final</h3>
              <ul className="space-y-3 text-sm text-slate-100">
                <li className="flex gap-2">🚀 Ativar Prompt Caching (Anthropic)</li>
                <li className="flex gap-2">🚀 Consolidar Classificação lead no prompt do turno</li>
                <li className="flex gap-2">🚀 Implementar Context Compression (Summary)</li>
                <li className="flex gap-2">🚀 Guard Engine via LLM (Haiku) para validação de tom</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Footer Audit Summary */}
        <footer className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
             <div>
               <p className="text-xs text-slate-500 uppercase">Arquitetura</p>
               <p className="text-lg font-bold">Runtime V2</p>
             </div>
             <div>
               <p className="text-xs text-slate-500 uppercase">Modelo Padrão</p>
               <p className="text-lg font-bold text-blue-400">Haiku 4.5</p>
             </div>
             <div>
               <p className="text-xs text-slate-500 uppercase">Custo/Turno</p>
               <p className="text-lg font-bold text-green-400">~US$ 0.0003</p>
             </div>
             <div>
               <p className="text-xs text-slate-500 uppercase">Escalonamento</p>
               <p className="text-lg font-bold text-red-400">Bloqueado</p>
             </div>
           </div>
        </footer>

      </div>
    </div>
  );
}

function IAItem({ name, provider, model, purpose, files, api }: { name: string, provider: string, model: string, purpose: string, files: string, api: string }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-lg space-y-3">
      <div className="flex justify-between items-start">
        <h3 className="font-bold text-slate-100">{name}</h3>
        <Badge variant="outline" className="text-[10px] uppercase">{provider}</Badge>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-blue-400">
          <Cpu className="w-3 h-3" />
          <span className="font-mono">{model}</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{purpose}</p>
        <div className="pt-2 border-t border-slate-800 space-y-1">
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <FileText className="w-3 h-3" />
            <span>{files}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-600 truncate">
            <Zap className="w-3 h-3" />
            <span>{api}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ icon, label, sub }: { icon: React.ReactNode, label: string, sub: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center group">
      <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center group-hover:border-blue-500 transition-colors">
        {React.cloneElement(icon as React.ReactElement, { className: "w-5 h-5 text-slate-400 group-hover:text-blue-400" })}
      </div>
      <div>
        <p className="text-xs font-bold text-slate-300">{label}</p>
        <p className="text-[10px] text-slate-500 uppercase">{sub}</p>
      </div>
    </div>
  );
}
