import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { useWorkspace } from "@/contexts/workspace-context";

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
  { key: "regra_estilo_escrita", label: "10. Estilo de escrita (soar humano)" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];
type Values = Record<FieldKey, string>;

// Campos BRAND — sem fallback universal no código; workspace sem seed
// nasce vazio nesses 3 e é isso que a UI deve deixar explícito.
const BRAND_FIELDS: ReadonlyArray<FieldKey> = [
  "persona",
  "terminologia_redes",
  "exemplo_disparo",
];

export function IdentidadeCard() {
  const qc = useQueryClient();
  const { activeWorkspaceId } = useWorkspace();
  const fetchFn = useServerFn(getAgentIdentity);
  const saveFn = useServerFn(updateAgentIdentity);
  const { data } = useQuery({
    queryKey: ["agent_identity", activeWorkspaceId],
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
    mutationFn: (payload: Values) => {
      // Persistir SOMENTE campos divergentes do default atual.
      // Campos iguais ao default viram null no banco (backend converte "" → null),
      // assim futuras atualizações de DEFAULT_IDENTITY chegam livremente.
      const diff: Record<string, string> = {};
      for (const f of FIELDS) {
        diff[f.key] = payload[f.key] === (defaults?.[f.key] as string) ? "" : payload[f.key];
      }
      return saveFn({ data: diff as Values });
    },
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
              const storedVal = (stored?.[f.key] ?? null) as string | null;
              const isCustomizedInDb = !!(storedVal && storedVal.trim().length > 0 && storedVal !== (defaults[f.key] as string));
              const isBrand = BRAND_FIELDS.includes(f.key);
              const isEmptyBrand = isBrand && val.trim().length === 0;
              return (
                <div key={f.key} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium">{f.label}</label>
                      {isEmptyBrand ? (
                        <Badge
                          variant="outline"
                          className="border-amber-400 text-amber-700 dark:text-amber-400 text-[10px]"
                        >
                          Sem configuração
                        </Badge>
                      ) : isDefault ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {isBrand ? "Padrão do sistema" : "Padrão do sistema (safety)"}
                        </Badge>
                      ) : (
                        <Badge variant="default" className="text-[10px]">
                          {isCustomizedInDb ? "Customizado (salvo)" : "Editado (não salvo)"}
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isDefault}
                      onClick={() => restoreDefault(f.key)}
                      title="Volta ao texto padrão do código e, ao salvar, remove a customização do banco"
                    >
                      <RotateCcw className="mr-1 h-3 w-3" /> Padrão
                    </Button>
                  </div>
                  <Textarea
                    value={val}
                    rows={f.key === "exemplo_disparo" ? 18 : 6}
                    className="font-mono text-xs"
                    placeholder={
                      isEmptyBrand
                        ? "Sem configuração — este workspace ainda não tem persona/terminologia/exemplo. Configure aqui, ou use o botão “Seed a partir do template Mind” acima pra começar com a Júlia."
                        : undefined
                    }
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