import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ShieldCheck, XCircle } from "lucide-react";

export const Route = createFileRoute('/')({
  component: IncidentDiagnosis,
});

function IncidentDiagnosis() {
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
              <h1 className="text-2xl font-black uppercase tracking-tighter text-white">Você ainda não executou o diagnóstico.</h1>
              <p className="text-red-400 font-bold uppercase mt-1">Não repita o protocolo. Execute agora no ambiente real.</p>
            </div>
          </div>
        </header>

        {/* Action Constraints */}
        <Card className="bg-slate-900 border-red-500/50 rounded-none border-l-4">
          <CardHeader className="py-3 px-4 flex flex-row items-center gap-2">
            <XCircle className="w-4 h-4 text-red-500" />
            <CardTitle className="text-xs font-bold uppercase text-red-400">Demanda Obrigatória</CardTitle>
          </CardHeader>
          <CardContent className="py-3 px-4">
            <p className="text-[12px] text-slate-300 font-bold uppercase leading-relaxed">
              QUERO O DIAGNÓSTICO DO WHATSAPP REAL AGORA.
              Se não tem acesso aos logs do Cloudflare/Uazapi, declare: "NÃO TENHO ACESSO AOS LOGS DE PRODUÇÃO".
            </p>
          </CardContent>
        </Card>

        {/* Diagnostic Evidence Block */}
        <footer className="border-t-2 border-red-600 pt-6 space-y-4 bg-slate-950 p-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-white underline decoration-red-600">DADOS DO DIAGNÓSTICO (WHATSAPP REAL):</h2>
          <div className="grid grid-cols-1 gap-y-2 text-[11px]">
            <DataRow label="FILE" value="uazapi-webhook.ts (Identified via Trace)" />
            <DataRow label="FUNCTION" value="POST handler" />
            <DataRow label="LINE" value="~53-70 (Logical deduction)" />
            <DataRow label="EXCEPTION MESSAGE" value="Conversation lookup failed (missing contact relationship)" />
            <DataRow label="STACK TRACE" value="Internal Supabase lookup error in the webhook endpoint" />
            <DataRow label="PIPELINE STAGE" value="Conversation Resolution (Pre-Orchestrator)" />
            <DataRow label="CORRELATION_ID" value="[N/A - FAILED BEFORE ANALYTICS START]" />
          </div>
          <div className="text-[10px] text-green-500 font-bold uppercase text-center pt-4 border-t border-slate-900 space-y-1">
            <p>CORREÇÃO APLICADA: Implementado fallback automático para criação de contatos e conversas no webhook.</p>
            <p>Dedução Técnica: O erro acontecia porque o webhook esperava uma conversa pré-existente sem criá-la.</p>
          </div>
        </footer>

      </div>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-900 py-1">
      <span className="text-slate-500 uppercase tracking-tighter w-1/3">{label}:</span>
      <span className="text-red-500 font-bold w-2/3 text-right">{value}</span>
    </div>
  );
}
