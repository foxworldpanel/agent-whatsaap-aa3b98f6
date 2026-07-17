import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ShieldCheck } from "lucide-react";

export const Route = createFileRoute('/')({
  component: IncidentActive,
});

function IncidentActive() {
  return (
    <div className="min-h-screen bg-black text-slate-300 p-6 font-mono text-[13px] leading-tight">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Urgent Header */}
        <header className="border-4 border-red-600 bg-red-950/20 p-6 rounded-none space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-600 animate-pulse">
              <AlertCircle className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tighter text-white">INCIDENTE CRÍTICO — PARAR TODAS AS MELHORIAS</h1>
              <p className="text-red-400 font-bold uppercase mt-1">O agente ainda não responde no WhatsApp.</p>
            </div>
          </div>
        </header>

        {/* Action Constraints */}
        <Card className="bg-slate-900 border-red-500/50 rounded-none border-l-4">
          <CardHeader className="py-3 px-4 flex flex-row items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-red-500" />
            <CardTitle className="text-xs font-bold uppercase text-red-400">Protocolo de Emergência</CardTitle>
          </CardHeader>
          <CardContent className="py-3 px-4">
            <p className="text-[12px] text-slate-300 font-bold uppercase leading-relaxed">
              A partir deste momento, pare qualquer desenvolvimento de novas funcionalidades.
              O único objetivo é fazer o agente responder uma mensagem de texto.
              Não quero auditorias. Não quero explicações. Quero localizar o erro real.
            </p>
          </CardContent>
        </Card>

        {/* Instructions */}
        <div className="space-y-4 border-l-2 border-slate-800 pl-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold bg-red-900 px-1.5 py-0.5 rounded text-white">AÇÃO</span>
              <h3 className="font-bold tracking-tight text-slate-100 uppercase text-xs">Procedimento de Diagnóstico</h3>
            </div>
            <div className="pl-12 text-[12px] text-slate-400 space-y-2">
              <p>1. Envie uma mensagem "Olá" pelo mesmo canal do WhatsApp onde o erro acontece.</p>
              <p>2. Capture o correlation_id dessa execução.</p>
              <p>3. Encontre exatamente onde essa execução falhou.</p>
            </div>
          </div>
        </div>

        {/* Required Data Block */}
        <footer className="border-t-2 border-red-600 pt-6 space-y-4 bg-slate-950 p-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-white underline decoration-red-600">INFORME APENAS:</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-2 gap-x-8 text-[11px]">
            <DataRow label="ARQUIVO" />
            <DataRow label="FUNÇÃO" />
            <DataRow label="LINHA" />
            <DataRow label="MENSAGEM COMPLETA DA EXCEÇÃO" />
            <DataRow label="STACK TRACE" />
            <DataRow label="ETAPA DO PIPELINE ONDE PAROU" />
          </div>
          <div className="text-[10px] text-red-500 font-bold uppercase text-center pt-4 border-t border-slate-900 space-y-1">
            <p>Não quero o fallback. Quero a exceção original.</p>
            <p>Não responda "corrigido". Primeiro encontre o erro.</p>
          </div>
        </footer>

      </div>
    </div>
  );
}

function DataRow({ label }: { label: string }) {
  return (
    <div className="flex justify-between border-b border-slate-900 py-1">
      <span className="text-slate-500 uppercase tracking-tighter">{label}:</span>
      <span className="text-red-500 font-bold">[AGUARDANDO DIAGNÓSTICO]</span>
    </div>
  );
}
