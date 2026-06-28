import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { getAgentConfig, saveAgentModules } from "@/lib/agent.functions";
import { DEFAULT_MODULES, MODULE_LIST } from "@/lib/agent-modules";

export const Route = createFileRoute("/_authenticated/agente")({
  ssr: false,
  head: () => ({ meta: [{ title: "Agente IA · ZapAgent" }] }),
  component: AgentePage,
});

function AgentePage() {
  const qc = useQueryClient();
  const fetchCfg = useServerFn(getAgentConfig);
  const saveFn = useServerFn(saveAgentModules);
  const { data: cfg } = useQuery({ queryKey: ["agent_config"], queryFn: () => fetchCfg() });

  const [modules, setModules] = useState<Record<string, string>>({});
  const [openKey, setOpenKey] = useState<string | null>(MODULE_LIST[0]?.key ?? null);

  useEffect(() => {
    const stored = (cfg?.modules ?? {}) as Record<string, string>;
    const next: Record<string, string> = {};
    for (const m of MODULE_LIST) {
      next[m.key] = stored[m.key] ?? DEFAULT_MODULES[m.key] ?? "";
    }
    setModules(next);
  }, [cfg]);

  const save = useMutation({
    mutationFn: (data: Record<string, string>) => saveFn({ data: { modules: data } }),
    onSuccess: () => {
      toast.success("Módulos salvos");
      qc.invalidateQueries({ queryKey: ["agent_config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalChars = useMemo(
    () => Object.values(modules).reduce((s, v) => s + (v?.length ?? 0), 0),
    [modules],
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agente IA</h1>
          <p className="text-sm text-muted-foreground">
            15 módulos de conhecimento. {totalChars.toLocaleString("pt-BR")} caracteres.
          </p>
        </div>
        <Button onClick={() => save.mutate(modules)} disabled={save.isPending}>
          <Save className="mr-2 h-4 w-4" />
          {save.isPending ? "Salvando..." : "Salvar tudo"}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {MODULE_LIST.map((m) => {
          const open = openKey === m.key;
          const value = modules[m.key] ?? "";
          return (
            <Card key={m.key} className="overflow-hidden">
              <Collapsible open={open} onOpenChange={(o) => setOpenKey(o ? m.key : null)}>
                <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{m.emoji}</span>
                    <div>
                      <div className="font-medium">{m.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {value.length.toLocaleString("pt-BR")} caracteres
                      </div>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </CollapsibleTrigger>
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
                      onClick={() => save.mutate(modules)}
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
