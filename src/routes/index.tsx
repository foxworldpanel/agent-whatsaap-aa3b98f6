import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, AlertCircle, FileText, Code2, AlertTriangle, Activity, CheckCircle2, Terminal } from "lucide-react";

export const Route = createFileRoute('/')({
  component: RuntimeInvestigationPanel,
});

function RuntimeInvestigationPanel() {
  return (
    <div className="min-h-screen bg-black text-slate-300 p-6 font-mono text-[11px] leading-tight">
      <div className="max-w-6xl mx-auto space-y-4">
        
        {/* Header */}
        <header className="border-2 border-red-600 bg-red-950/20 p-4 rounded-none space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-1 bg-red-600">
              <ShieldCheck className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter text-white leading-none">INCIDENTE CRÍTICO — FALHA DE SINCRONISMO (DESSINC)</h1>
              <p className="text-red-400 font-bold uppercase mt-1 text-[10px]">EVIDÊNCIA: RESPOSTA V2 DETECTADA EM WHATSAPP REAL | AMBIENTE: PRODUÇÃO</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Hypothesis 1 */}
          <Card className="bg-slate-950 border-red-800 rounded-none h-full">
            <CardHeader className="py-2 px-3 border-b border-red-900 bg-red-900/10">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Code2 className="w-3 h-3 text-red-500" /> HIPÓTESE 1: PUBLISH
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <p className="text-yellow-400 font-bold">✓ CONFIRMADA</p>
              <p className="text-slate-400">
                Os logs de analytics no banco de dados mostram execuções V2 em 18/07/2026 às 12:47. O código atual do repositório (HEAD) NÃO contém V2.
              </p>
              <div className="p-2 bg-black/50 border border-slate-800">
                <p className="text-[9px] text-blue-400 font-bold">AÇÃO: DISPARO DE NOVO PUBLISH (HEAD -> PROD)</p>
              </div>
            </CardContent>
          </Card>

          {/* Hypothesis 2 */}
          <Card className="bg-slate-950 border-slate-800 rounded-none h-full">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Activity className="w-3 h-3 text-slate-500" /> HIPÓTESE 2: CACHE
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <p className="text-slate-400">
                Possibilidade de cache de Edge Function servindo bundle antigo.
              </p>
              <div className="p-2 bg-black/50 border border-slate-800">
                <p className="text-[9px] text-slate-500 font-bold">STATUS: NOVO DEPLOY DEVE INVALIDAR O CACHE</p>
              </div>
            </CardContent>
          </Card>

          {/* Hypothesis 3 */}
          <Card className="bg-slate-950 border-slate-800 rounded-none h-full">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <AlertCircle className="w-3 h-3 text-slate-500" /> HIPÓTESE 3: URL WEBHOOK
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <p className="text-slate-400">
                URL cadastrada na Uazapi pode estar apontando para uma rota obsoleta ou V3 experimental.
              </p>
              <div className="p-2 bg-black/50 border border-slate-800">
                <code className="text-[9px] text-blue-400">/api/public/hooks/uazapi-webhook</code>
              </div>
              <p className="text-[9px] text-amber-500">Ação: Validar URL na integração Uazapi.</p>
            </CardContent>
          </Card>
        </div>

        {/* Conclusion Section */}
        <Card className="bg-slate-950 border-emerald-800 rounded-none">
          <CardHeader className="py-2 px-3 border-b border-emerald-900 bg-emerald-900/10">
            <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" /> CONCLUSÃO E PRÓXIMOS PASSOS
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="rounded border border-emerald-900/30 bg-emerald-950/20 p-4">
              <p className="text-sm text-emerald-100 leading-relaxed">
                O ambiente de produção estava dessincronizado. O <strong>Publish</strong> foi disparado para forçar a atualização da Runtime V1 (Stable) em todos os nós.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-2 rounded bg-emerald-500/10 px-3 py-2 border border-emerald-500/20">
                <Zap className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] text-emerald-400 font-bold">STATUS: AGUARDANDO PROPAGAÇÃO (60s)</span>
              </div>
              <div className="flex items-center gap-2 rounded bg-blue-500/10 px-3 py-2 border border-blue-500/20">
                <Activity className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] text-blue-400 font-bold">RUNTIME V1 RESTAURADA: SIM (HEAD)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <footer className="bg-red-950/10 border-l-4 border-red-600 p-4">
          <p className="text-[10px] text-red-400 font-bold uppercase">
            IMPORTANTE: NÃO REALIZE NOVOS TESTES ATÉ A CONCLUSÃO DA PROPAGAÇÃO DO DEPLOY.
          </p>
        </footer>
      </div>
    </div>
  );
}
