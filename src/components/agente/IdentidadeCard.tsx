import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  getAgentIdentity,
  updateAgentIdentity,
} from "@/lib/agent-identity.functions";

const FIELDS = [
  { key: "persona", label: "1. Persona" },
  { key: "reconhecimento_interesse", label: "2. Reconhecimento de interesse" },
  { key: "regra_emoji", label: "3. Regra de emoji" },
  { key: "regra_split", label: "4. Regra de split de mensagem" },
  { key: "terminologia_redes", label: "5. Terminologia por rede" },
  { key: "regra_anti_invencao", label: "6. Anti-invenção" },
  { key: "regra_teste_gratis", label: "7. Teste grátis (regras de ouro)" },
  { key: "regra_encerramento", label: "8. Encerramento por recusa" },
  { key: "exemplo_disparo", label: "9. Exemplo modelo de disparo" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];
type Values = Record<FieldKey, string>;

export function IdentidadeCard() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getAgentIdentity);
  const saveFn = useServerFn(updateAgentIdentity);
  const { data } = useQuery({
    queryKey: ["agent_identity"],
    queryFn: () => fetchFn(),
  });

  const defaults = useMemo(() => (data?.defaults ?? null), [data]);
  const stored = useMemo(() => (data?.stored ?? null), [data]);

  const [open, setOpen] = useState(true);
  const [values, setValues] = useState<Values | null>(null);

  useEffect(() => {
    if (!defaults) return;
    const init = {} as Values;
    for (const f of FIELDS) {
      const s = (stored?.[f.key] ?? "") as string;
      init[f.key] = s && s.trim() ? s : (defaults[f.key] as string);
    }
    setValues(init);
  }, [defaults, stored]);

  const save = useMutation({
    mutationFn: (payload: Values) => saveFn({ data: payload }),
    onSuccess: () => {
      toast.success("Identidade salva");
      qc.invalidateQueries({ queryKey: ["agent_identity"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!values || !defaults) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">Carregando identidade…</Card>
    );
  }

  const restoreDefault = (key: FieldKey) => {
    setValues((prev) => (prev ? { ...prev, [key]: defaults[key] as string } : prev));
  };

  return (
    <Card className="overflow-hidden border-primary/40">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40">
          <div className="flex items-center gap-3">
            <span className="text-lg">🧬</span>
            <div>
              <div className="font-medium">Identidade da Júlia (fonte única)</div>
              <div className="text-xs text-muted-foreground">
                Personalidade, regras de comportamento e exemplo de disparo — consumidos por todos os prompts do agente.
              </div>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t bg-muted/10 p-4">
          <div className="flex flex-col gap-4">
            {FIELDS.map((f) => {
              const val = values[f.key] ?? "";
              const isDefault = val === (defaults[f.key] as string);
              return (
                <div key={f.key} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">{f.label}</label>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isDefault}
                      onClick={() => restoreDefault(f.key)}
                    >
                      <RotateCcw className="mr-1 h-3 w-3" /> Padrão
                    </Button>
                  </div>
                  <Textarea
                    value={val}
                    rows={f.key === "exemplo_disparo" ? 18 : 6}
                    className="font-mono text-xs"
                    onChange={(e) =>
                      setValues((prev) => (prev ? { ...prev, [f.key]: e.target.value } : prev))
                    }
                  />
                </div>
              );
            })}
            <div className="flex justify-end">
              <Button
                onClick={() => save.mutate(values)}
                disabled={save.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                {save.isPending ? "Salvando…" : "Salvar identidade"}
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}