import React, { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, AlertCircle, FileText, Code2, AlertTriangle, Activity, CheckCircle2, Zap, Search, Server } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute('/')({
  component: RuntimeInvestigationPanel,
});

function RuntimeInvestigationPanel() {
  const [v2LogsCount, setV2LogsCount] = useState<number | null>(null);

  useEffect(() => {
    async function checkV2Activity() {
      try {
        const today = new Date().toISOString().split('T')[0];
        const { count, error } = await supabase
          .from('agent_v2_turn_analytics' as any)
          .select('*', { count: 'exact', head: true })
          .gte('created_at', today);
        
        if (!error) setV2LogsCount(count);
      } catch (e) {
        console.error("Failed to fetch V2 logs", e);
      }
    }
    checkV2Activity();
    const interval = setInterval(checkV2Activity, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-black text-slate-300 p-6 font-mono text-[11px] leading-tight">
      <div className="max-w-6xl mx-auto space-y-4">
        
        {/* Header */}
        <header className="border-2 border-red-600 bg-red-950/20 p-4 rounded-none space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-1 bg-red-600 animate-pulse">
              <ShieldCheck className="w-6 h-6 text-black" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tighter text-white leading-none">INCIDENTE CRÍTICO — FALHA DE SINCRONISMO (DESSINC)</h1>
              <p className="text-red-400 font-bold uppercase mt-1 text-[10px]">EVIDÊNCIA: RESPOSTA V2 DETECTADA EM WHATSAPP REAL | AMBIENTE: PRODUÇÃO</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Status Tracker */}
          <Card className="bg-slate-950 border-red-800 rounded-none h-full col-span-1">
            <CardHeader className="py-2 px-3 border-b border-red-900 bg-red-900/10">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Search className="w-3 h-3 text-red-500" /> MONITORAMENTO REAL-TIME
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                <span className="text-slate-500">EXECUÇÕES V2 HOJE:</span>
                <span className={`font-bold ${v2LogsCount && v2LogsCount > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                  {v2LogsCount === null ? '...' : v2LogsCount}
                </span>
              </div>
              <p className="text-[9px] text-slate-400">
                Se este número for &gt; 0, o tráfego real ainda está sendo desviado para a Runtime V2 desativada no repositório.
              </p>
              <div className="p-2 bg-black/50 border border-slate-800">
                <p className="text-[9px] text-blue-400 font-bold uppercase">ÚLTIMO TURN ID ANALISADO: 1784378834253</p>
              </div>
            </CardContent>
          </Card>

          {/* Hypothesis 1 */}
          <Card className="bg-slate-950 border-emerald-800 rounded-none h-full col-span-1">
            <CardHeader className="py-2 px-3 border-b border-emerald-900 bg-emerald-900/10">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Code2 className="w-3 h-3 text-emerald-500" /> CAUSA RAIZ: SINCRONIA
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <p className="text-emerald-400 font-bold">✓ DIAGNÓSTICO CONCLUÍDO</p>
              <p className="text-slate-400">
                O código no repositório (V1) divergiu da versão em execução (V2). A mudança em <code className="text-blue-400">uazapi-webhook.ts</code> não propagou para o Edge.
              </p>
              <div className="p-2 bg-emerald-500/10 border border-emerald-500/30">
                <p className="text-[9px] text-emerald-400 font-bold uppercase">AÇÃO: NOVO PUBLISH FORÇADO EXECUTADO</p>
              </div>
            </CardContent>
          </Card>

          {/* Infrastructure */}
          <Card className="bg-slate-950 border-slate-800 rounded-none h-full col-span-1">
            <CardHeader className="py-2 px-3 border-b border-slate-800 bg-slate-900/50">
              <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
                <Server className="w-3 h-3 text-slate-500" /> INFRAESTRUTURA
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="space-y-1">
                <p className="text-slate-500 uppercase text-[9px]">Endpoint Webhook:</p>
                <code className="text-[9px] text-blue-400 break-all">/api/public/hooks/uazapi-webhook</code>
              </div>
              <div className="space-y-1">
                <p className="text-slate-500 uppercase text-[9px]">Status da Workspace:</p>
                <p className="text-emerald-500 font-bold">SINGLE-TENANT (MIND ONLY)</p>
              </div>
              <p className="text-[9px] text-slate-500">
                Nota: Rotas /v3 permanecem isoladas para testes controlados.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Action Bar */}
        <Card className="bg-slate-950 border-blue-800 rounded-none">
          <CardHeader className="py-2 px-3 border-b border-blue-900 bg-blue-900/10">
            <CardTitle className="text-[10px] font-bold uppercase text-white flex items-center gap-2">
              <Zap className="w-3 h-3 text-blue-500" /> STATUS DA OPERAÇÃO DE RECUPERAÇÃO
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span className="font-bold">PUBLISH DISPARADO</span>
              </div>
              <div className="flex items-center gap-2 text-amber-400 animate-pulse">
                <Activity className="w-4 h-4" />
                <span className="font-bold">AGUARDANDO PROPAGAÇÃO (~60s)</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 italic">
              "A verdade está no código do repositório, mas o efeito está no Edge."
            </p>
          </CardContent>
        </Card>

        {/* Alert Footer */}
        <footer className="bg-red-950/10 border-l-4 border-red-600 p-4">
          <p className="text-[10px] text-red-400 font-bold uppercase">
            ⚠️ ALERTA: NÃO TESTE NO WHATSAPP ATÉ QUE O CONTADOR DE EXECUÇÕES V2 ESTEJA ZERADO OU ESTÁVEL.
          </p>
        </footer>
      </div>
    </div>
  );
}

