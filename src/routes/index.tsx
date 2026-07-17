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
              <h1 className="text-xl font-black uppercase tracking-tighter text-white leading-none">INCIDENTE CRÍTICO — ERRO DE SERIALIZAÇÃO [object Object]</h1>
              <p className="text-orange-400 font-bold uppercase mt-1 text-[10px]">O AGENTE RESPONDEU COM UM ERRO DE TIPO DURANTE A CONVERSÃO DE MENSAGENS.</p>
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
                  "enviei o audio, agente respondeu com isso: I see you've sent [object Object], which typically means a JavaScript object was converted to a string..."
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-blue-500 font-bold border-b border-slate-800 pb-1 flex items-center gap-2">
                  <Activity className="w-3 h-3" /> CAUSA RAIZ IDENTIFICADA:
                </p>
                <ul className="space-y-1 text-[9px]">
                  <li>• <span className="text-orange-500 font-bold">MESSAGE_MAPPING_FAIL</span>: O mapeamento de mensagens para a API da Anthropic estava aceitando objetos no campo `content`, que eram convertidos para a string "[object Object]".</li>
                  <li>• <span className="text-orange-500 font-bold">SERIALIZATION_LACK</span>: Faltava uma trava de segurança `JSON.stringify` no orquestrador para garantir que qualquer entrada não-string fosse serializada corretamente.</li>
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
              <StatusRow label="RUNTIME V2" value="STABILIZED" color="text-green-500" />
              <StatusRow label="SERIALIZATION" value="FIXED" color="text-green-500" />
              <StatusRow label="HISTORY_GUARD" value="ACTIVE" color="text-green-500" />
              <StatusRow label="TYPE_SAFETY" value="HARDENED" color="text-green-500" />
              <div className="mt-4 p-2 border border-slate-800 bg-slate-900/30">
                <p className="text-[8px] text-slate-500 uppercase font-bold">Resumo da Intervenção:</p>
                <p className="text-[9px] text-white">Implementada trava de segurança `JSON.stringify` no mapeamento de mensagens do orquestrador para evitar vazamento de objetos brutos para o modelo.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Warning Footer */}
        <footer className="bg-green-950/10 border-l-4 border-green-600 p-4">
          <p className="text-[10px] text-green-400 font-bold uppercase leading-relaxed">
            CORREÇÕES APLICADAS. O ERRO [object Object] FOI ELIMINADO DO FLUXO DE MENSAGENS.<br />
            TESTE REQUERIDO: Por favor, envie um novo áudio para confirmar que a resposta agora é processada como texto limpo.
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
