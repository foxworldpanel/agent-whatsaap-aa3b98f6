import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { getAgentConfig, saveAgentModules, setServicesRealtime } from "@/lib/agent.functions";
import { DEFAULT_MODULES, MODULE_LIST } from "@/lib/agent-modules";
import { TesteGratisCard } from "@/components/agente/TesteGratisCard";

export const Route = createFileRoute("/_authenticated/agente")({
  ssr: false,
  head: () => ({ meta: [{ title: "Agente IA · ZapAgent" }] }),
  component: AgentePage,
});

function AgentePage() {
  const qc = useQueryClient();
  const fetchCfg = useServerFn(getAgentConfig);
  const saveFn = useServerFn(saveAgentModules);
  const toggleRealtimeFn = useServerFn(setServicesRealtime);
  const { data: cfg } = useQuery({ queryKey: ["agent_config"], queryFn: () => fetchCfg() });

  const [modules, setModules] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [openKey, setOpenKey] = useState<string | null>(MODULE_LIST[0]?.key ?? null);

  useEffect(() => {
    const stored = (cfg?.modules ?? {}) as Record<string, string>;
    const storedEnabled = ((cfg as { modules_enabled?: Record<string, boolean> } | null | undefined)
      ?.modules_enabled ?? {}) as Record<string, boolean>;
    const next: Record<string, string> = {};
    const nextEnabled: Record<string, boolean> = {};
    for (const m of MODULE_LIST) {
      next[m.key] = stored[m.key] ?? DEFAULT_MODULES[m.key] ?? "";
      nextEnabled[m.key] = storedEnabled[m.key] !== false;
    }
    setModules(next);
    setEnabled(nextEnabled);
  }, [cfg]);

  const save = useMutation({
    mutationFn: (payload: { modules: Record<string, string>; modules_enabled: Record<string, boolean> }) =>
      saveFn({ data: payload }),
    onSuccess: () => {
      toast.success("Módulos salvos");
      qc.invalidateQueries({ queryKey: ["agent_config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doSave = () => save.mutate({ modules, modules_enabled: enabled });

  const toggleRealtime = useMutation({
    mutationFn: (enabled: boolean) => toggleRealtimeFn({ data: { enabled } }),
    onSuccess: (_d, enabled) => {
      toast.success(enabled ? "Consulta em tempo real ativada" : "Consulta em tempo real desativada");
      qc.invalidateQueries({ queryKey: ["agent_config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const realtimeOn = (cfg as { services_realtime?: boolean } | null | undefined)?.services_realtime ?? false;

  const totalChars = useMemo(
    () => Object.values(modules).reduce((s, v) => s + (v?.length ?? 0), 0),
    [modules],
  );
  const activeCount = useMemo(
    () => MODULE_LIST.filter((m) => enabled[m.key] !== false).length,
    [enabled],
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agente IA</h1>
          <p className="text-sm text-muted-foreground">
            {activeCount}/{MODULE_LIST.length} módulos ativos · {totalChars.toLocaleString("pt-BR")} caracteres.
          </p>
        </div>
        <Button onClick={doSave} disabled={save.isPending}>
          <Save className="mr-2 h-4 w-4" />
          {save.isPending ? "Salvando..." : "Salvar tudo"}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <TesteGratisCard />
        <Card className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-medium flex items-center gap-2">
                <span>💰</span> Consultar preços em tempo real
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                Quando ligado, o agente busca a lista de serviços e preços atualizada
                no painel SMM antes de responder sobre preço. Requer API Key do painel
                cadastrada em Configurações.
              </p>
            </div>
            <Switch
              checked={realtimeOn}
              disabled={toggleRealtime.isPending}
              onCheckedChange={(v) => toggleRealtime.mutate(v)}
            />
          </div>
        </Card>
        {MODULE_LIST.map((m) => {
          const open = openKey === m.key;
          const value = modules[m.key] ?? "";
          const isOn = enabled[m.key] !== false;
          return (
            <Card key={m.key} className={`overflow-hidden ${isOn ? "" : "opacity-60"}`}>
              <Collapsible open={open} onOpenChange={(o) => setOpenKey(o ? m.key : null)}>
                <div className="flex w-full items-center gap-3 px-4 py-3">
                  <div
                    className="flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Switch
                      checked={isOn}
                      onCheckedChange={(v) =>
                        setEnabled((prev) => ({ ...prev, [m.key]: v }))
                      }
                    />
                  </div>
                  <CollapsibleTrigger className="flex flex-1 items-center justify-between gap-3 text-left hover:bg-muted/40 rounded-md px-2 py-1">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{m.emoji}</span>
                      <div>
                        <div className="font-medium">
                          {m.title}
                          {!isOn && (
                            <span className="ml-2 text-xs text-muted-foreground">(desligado)</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {value.length.toLocaleString("pt-BR")} caracteres
                        </div>
                      </div>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                    />
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="border-t bg-muted/10 p-4">
                  <Textarea
                    value={value}
                    onChange={(e) =>
                      setModules((prev) => ({ ...prev, [m.key]: e.target.value }))
                    }
                    rows={16}
                    className="font-mono text-sm"
                    placeholder={`Conteúdo do módulo ${m.title}`}
                  />
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      onClick={doSave}
                      disabled={save.isPending}
                    >
                      Salvar
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
