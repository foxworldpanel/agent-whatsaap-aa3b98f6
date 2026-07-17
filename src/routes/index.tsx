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
        <header className="border-2 border-orange-600 bg-orange-950/20 p-4 rounded-none space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-1 bg-orange-600">
              <AlertCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter text-white leading-none">INCIDENTE CRÍTICO — RESPOSTA [object Object] DETECTADA</h1>
              <p className="text-orange-400 font-bold uppercase mt-1 text-[10px]">O AGENTE RESPONDEU COM UM ERRO DE SERIALIZAÇÃO APÓS ÁUDIO.</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Section 1 & 2: Diagnosis & Instrumentation */}
          <Card className="bg-slate-950 border-slate-800 rounded-none col-span-1 md:col-span-2">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Search className="w-3 h-3 text-yellow-500" /> ANÁLISE DO INCIDENTE [object Object]
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-4">
              <div className="p-2 bg-red-950/20 border border-red-900/50">
                <p className="text-red-400 font-bold uppercase">Relato do Usuário:</p>
                <p className="text-[10px] mt-1 italic text-white bg-black/40 p-2 border-l-2 border-red-500">
                  "dei um boa noite por audio o agente respondeu com isso: I see you've sent `[object Object]`, which typically means something went wrong..."
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-blue-500 font-bold border-b border-slate-800 pb-1 flex items-center gap-2">
                  <Activity className="w-3 h-3" /> CAUSA RAIZ IDENTIFICADA:
                </p>
                <ul className="space-y-1 text-[9px]">
                  <li>• <span className="text-orange-500 font-bold">SYSTEM_PROMPT_BUG</span>: O orquestrador tentava acessar `prompt.system` em vez de `prompt.systemPrompt`, enviando um prompt de sistema vazio/indefinido.</li>
                  <li>• <span className="text-orange-500 font-bold">SERIALIZATION_LEAK</span>: Possível vazamento de objeto na transcrição ou no histórico que foi convertido para string por Claude.</li>
                  <li>• <span className="text-orange-500 font-bold">HISTORY_MISSING</span>: O webhook não estava carregando o histórico, forçando o modelo a operar sem contexto de mensagens anteriores.</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Status Section */}
          <Card className="bg-slate-950 border-slate-800 rounded-none h-full text-[10px]">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Send className="w-3 h-3 text-blue-500" /> STATUS DE CORREÇÃO
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-1">
              <StatusRow label="RUNTIME V2" value="RECOVERING" color="text-orange-500" />
              <StatusRow label="SYSTEM_PROMPT" value="FIXED" color="text-green-500" />
              <StatusRow label="HISTORY_LOAD" value="ACTIVE" color="text-green-500" />
              <StatusRow label="TYPE_ENFORCEMENT" value="HARDENED" color="text-green-500" />
              <StatusRow label="WHISPER_OUTPUT" value="STRING_GUARDED" color="text-green-500" />
              <div className="mt-4 p-2 border border-slate-800 bg-slate-900/30">
                <p className="text-[8px] text-slate-500 uppercase font-bold">Resumo da Intervenção:</p>
                <p className="text-[9px] text-white">O pipeline foi corrigido para garantir que o prompt de sistema seja entregue e que o histórico de mensagens seja carregado no turno V2.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Warning Footer */}
        <footer className="bg-green-950/10 border-l-4 border-green-600 p-4">
          <p className="text-[10px] text-green-400 font-bold uppercase leading-relaxed">
            CORREÇÕES APLICADAS. SISTEMA RE-ESTABILIZADO.<br />
            TESTE REQUERIDO: Por favor, envie novamente o áudio "Boa noite" para validar o carregamento do histórico e a resposta textual correta.
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
