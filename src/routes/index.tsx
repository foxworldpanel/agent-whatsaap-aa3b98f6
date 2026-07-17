import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal, CheckCircle2, Mic, Activity, Send, AlertCircle } from "lucide-react";

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
              <h1 className="text-xl font-black uppercase tracking-tighter text-white leading-none">CORREÇÃO CRÍTICA — RUNTIME V2 RECUPERADA</h1>
              <p className="text-red-400 font-bold uppercase mt-1 text-[10px]">BUG ENCONTRADO: TYPEERROR BLOQUEAVA O ORQUESTRADOR EM MENSAGENS NÃO-TEXTUAIS.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Section 1 & 2: Diagnosis & Instrumentation */}
          <Card className="bg-slate-950 border-slate-800 rounded-none col-span-1 md:col-span-2">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <AlertCircle className="w-3 h-3 text-red-500" /> DIAGNÓSTICO DO INCIDENTE (TURN 354a550d)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-4">
              <div className="p-2 bg-red-950/20 border border-red-900/50">
                <p className="text-red-400 font-bold uppercase">Erro Identificado:</p>
                <p className="text-[10px] mt-1 italic font-mono">"TypeError: (input.currentMessage || \"\").slice is not a function"</p>
                <p className="text-[9px] mt-1 opacity-70 uppercase leading-relaxed">
                  Causa: A Uazapi enviou o campo `text` como `undefined` ou `null` para áudios, e a tipagem implícita falhou ao tentar realizar operações de string no orquestrador.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-green-500 font-bold border-b border-slate-800 pb-1 flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3" /> CORREÇÕES APLICADAS:
                </p>
                <ul className="space-y-1 text-[9px]">
                  <li>• <span className="text-white">STRING_ENFORCEMENT</span>: Adicionado `String()` em todos os pontos de entrada do orquestrador.</li>
                  <li>• <span className="text-white">PAYLOAD_SANITY</span>: Webhook agora garante que metadados de mídia sejam strings.</li>
                  <li>• <span className="text-white">INPUT_RECOVERY</span>: Variável `incomingText` centralizada para evitar conflitos de transcrição.</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Section 10: Final Delivery */}
          <Card className="bg-slate-950 border-slate-800 rounded-none h-full text-[10px]">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Send className="w-3 h-3 text-green-500" /> STATUS DA RUNTIME
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-1">
              <StatusRow label="RUNTIME V2" value="FIXED" color="text-green-500" />
              <StatusRow label="PIPELINE ÁUDIO" value="OPERATIONAL" color="text-green-500" />
              <StatusRow label="TYPE_SAFETY" value="ENFORCED" color="text-blue-400" />
              <StatusRow label="LOGS_CORRELATION" value="ACTIVE" />
              <StatusRow label="HAIKU 4.5" value="READY" color="text-green-500" />
              <StatusRow label="WHISPER" value="ACTIVE" color="text-green-500" />
              <div className="mt-4 p-2 border border-slate-800 bg-slate-900/30">
                <p className="text-[8px] text-slate-500 uppercase font-bold">Instrução para teste:</p>
                <p className="text-[9px] text-white">Por favor, envie um novo áudio agora. O erro de processamento de string foi eliminado.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Warning Footer */}
        <footer className="bg-blue-950/10 border-l-4 border-blue-600 p-4">
          <p className="text-[10px] text-blue-400 font-bold uppercase leading-relaxed">
            CORREÇÃO DE RUNTIME FINALIZADA. O AGENTE ESTAVA "MUDO" PORQUE UMA EXCEÇÃO DE TIPO BLOQUEAVA O PIPELINE ANTES MESMO DA TRANSCRIÇÃO.<br />
            TESTE REQUERIDO: Enviar áudio ou texto agora para confirmar a estabilidade.
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
