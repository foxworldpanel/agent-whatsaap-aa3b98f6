import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal, CheckCircle2, Mic, Activity, Send, AlertCircle, Search } from "lucide-react";

export const Route = createFileRoute('/')({
  component: InterventionPanel,
});

function InterventionPanel() {
  return (
    <div className="min-h-screen bg-black text-slate-300 p-6 font-mono text-[11px] leading-tight">
      <div className="max-w-6xl mx-auto space-y-4">
        
        {/* Urgent Header */}
        <header className="border-2 border-red-600 bg-red-950/20 p-4 rounded-none space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-1 bg-red-600">
              <Mic className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter text-white leading-none">INCIDENTE ATIVO — FALHA NO PIPELINE DE ÁUDIO</h1>
              <p className="text-red-400 font-bold uppercase mt-1 text-[10px]">O AGENTE CONTINUA SEM RESPONDER ÁUDIOS. INVESTIGAÇÃO EM CURSO.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Section 1 & 2: Diagnosis & Instrumentation */}
          <Card className="bg-slate-950 border-slate-800 rounded-none col-span-1 md:col-span-2">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Search className="w-3 h-3 text-yellow-500" /> ANÁLISE TÉCNICA (LOGS REAIS)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-4">
              <div className="p-2 bg-yellow-950/20 border border-yellow-900/50">
                <p className="text-yellow-400 font-bold uppercase">Status do Incidente:</p>
                <p className="text-[10px] mt-1 italic leading-relaxed">
                  Apesar da correção de tipos, áudios recentes (Turn 352d89a2) ainda apresentaram erro de processamento. 
                  Isso indica que o binário ou o link da Uazapi pode estar inacessível ou o campo de entrada é inconsistente.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-blue-500 font-bold border-b border-slate-800 pb-1 flex items-center gap-2">
                  <Activity className="w-3 h-3" /> AÇÕES IMEDIATAS:
                </p>
                <ul className="space-y-1 text-[9px]">
                  <li>• <span className="text-white">HARD_TYPE_GUARDS</span>: Substituído `String()` por verificações explícitas de tipo `typeof === 'string'`.</li>
                  <li>• <span className="text-white">LOG_INSPECTION</span>: Monitoramento ativo dos logs do Worker para capturar a falha exata no download do binário.</li>
                  <li>• <span className="text-white">WHISPER_SANITY</span>: Verificação se a API Key da OpenAI está enviando buffers válidos.</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Status Section */}
          <Card className="bg-slate-950 border-slate-800 rounded-none h-full text-[10px]">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Send className="w-3 h-3 text-blue-500" /> STATUS DA INVESTIGAÇÃO
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-1">
              <StatusRow label="RUNTIME V2" value="DEGRADED" color="text-yellow-500" />
              <StatusRow label="PIPELINE ÁUDIO" value="FIXING" color="text-yellow-500" />
              <StatusRow label="TYPE_SAFETY" value="STRENGTHENED" color="text-green-500" />
              <StatusRow label="WHISPER" value="ACTIVE" color="text-green-500" />
              <StatusRow label="UAZAPI_LINK" value="CHECKING" color="text-yellow-500" />
              <div className="mt-4 p-2 border border-slate-800 bg-slate-900/30">
                <p className="text-[8px] text-slate-500 uppercase font-bold">Diagnóstico Atual:</p>
                <p className="text-[9px] text-white">O orquestrador está sendo blindado contra entradas não-string que causavam o erro silencioso.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Warning Footer */}
        <footer className="bg-red-950/10 border-l-4 border-red-600 p-4">
          <p className="text-[10px] text-red-400 font-bold uppercase leading-relaxed">
            INCIDENTE AINDA ATIVO. O AGENTE CONTINUA FALHANDO NO PROCESSAMENTO DE ÁUDIO.<br />
            TESTE REQUERIDO: Por favor, tente enviar um áudio de teste curto (2-3 segundos) para gerarmos novos logs.
          </p>
        </footer>
      </div>
    </div>
  );
}

function StatusRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between border-b border-slate-900 pb-1">
      <span className="text-slate-500 uppercase tracking-tighter">{label}:</span>
      <span className={color || "text-slate-300 font-bold"}>{value}</span>
    </div>
  );
}

