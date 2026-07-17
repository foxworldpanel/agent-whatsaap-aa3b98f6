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
              <AlertCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter text-white leading-none">INCIDENTE RECORRENTE — [object Object] PERSISTENTE</h1>
              <p className="text-red-400 font-bold uppercase mt-1 text-[10px]">O AGENTE CONTINUA ENVIANDO O OBJETO BRUTO PARA O MODELO EM ÁUDIOS.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Section 1 & 2: Diagnosis & Instrumentation */}
          <Card className="bg-slate-950 border-slate-800 rounded-none col-span-1 md:col-span-2">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Search className="w-3 h-3 text-yellow-500" /> DIAGNÓSTICO PROFUNDO (TURN RECURSION)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-4">
              <div className="p-2 bg-red-950/20 border border-red-900/50">
                <p className="text-red-400 font-bold uppercase">Estado Crítico:</p>
                <p className="text-[10px] mt-1 italic text-white bg-black/40 p-2 border-l-2 border-red-500">
                  "mesmo erro, mandei audio o agente respondeu com isso [object Object]"
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-blue-500 font-bold border-b border-slate-800 pb-1 flex items-center gap-2">
                  <Activity className="w-3 h-3" /> AÇÕES DE CONTENÇÃO:
                </p>
                <ul className="space-y-1 text-[9px]">
                  <li>• <span className="text-red-500 font-bold">STRICT_STRING_CAST</span>: Forçado `String(m.content)` em todas as mensagens do histórico e atuais no orquestrador.</li>
                  <li>• <span className="text-red-500 font-bold">TYPE_SANITY_CHECK</span>: Verificada a integridade do pipeline de áudio; a transcrição está retornando um objeto inesperado que Claude interpreta literalmente.</li>
                  <li>• <span className="text-red-500 font-bold">GLOBAL_SAFEGUARD</span>: Aplicada trava de segurança global no ponto de saída para a API da Anthropic.</li>
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
              <StatusRow label="RUNTIME V2" value="FAILING" color="text-red-500" />
              <StatusRow label="AUDIO_PIPELINE" value="SUSPECTED" color="text-yellow-500" />
              <StatusRow label="SERIALIZATION" value="HARDENED" color="text-green-500" />
              <StatusRow label="HISTORY_GUARD" value="STRICT" color="text-green-500" />
              <div className="mt-4 p-2 border border-slate-800 bg-slate-900/30">
                <p className="text-[8px] text-slate-500 uppercase font-bold">Nota de Engenharia:</p>
                <p className="text-[9px] text-white">O erro persistente sugere que um objeto (provavelmente a resposta da transcrição ou um erro capturado) está sendo injetado como conteúdo da mensagem.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Warning Footer */}
        <footer className="bg-red-950/10 border-l-4 border-red-600 p-4">
          <p className="text-[10px] text-red-400 font-bold uppercase leading-relaxed">
            ATENÇÃO: A trava de serialização foi endurecida para `String()`.<br />
            TESTE MANDATÓRIO: Por favor, envie o áudio "Boa noite" novamente. Se o erro persistir, o problema reside na origem do objeto na `transcribeAudio`.
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
