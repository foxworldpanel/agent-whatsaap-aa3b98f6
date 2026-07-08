import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  getDailyPromo,
  saveDailyPromo,
  type DailyPromoRow,
} from "@/lib/agent-daily-promo.functions";
import { useWorkspace } from "@/contexts/workspace-context";

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(v: string): string | null {
  if (!v || v.trim().length === 0) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function DailyPromoCard() {
  const qc = useQueryClient();
  const { activeWorkspaceId } = useWorkspace();
  const fetchFn = useServerFn(getDailyPromo);
  const saveFn = useServerFn(saveDailyPromo);

  const { data } = useQuery({
    queryKey: ["agent_daily_promo", activeWorkspaceId],
    queryFn: () => fetchFn(),
  });

  const [open, setOpen] = useState(true);
  const [promoText, setPromoText] = useState("");
  const [active, setActive] = useState(false);
  const [expiresLocal, setExpiresLocal] = useState("");

  useEffect(() => {
    if (!data) return;
    const d = data as DailyPromoRow;
    setPromoText(d.promo_text ?? "");
    setActive(!!d.active);
    setExpiresLocal(toDatetimeLocalValue(d.expires_at));
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          promo_text: promoText,
          active,
          expires_at: fromDatetimeLocalValue(expiresLocal),
        },
      }),
    onSuccess: () => {
      toast.success("Promoção do dia salva");
      qc.invalidateQueries({ queryKey: ["agent_daily_promo"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const expiresDate = expiresLocal ? new Date(expiresLocal) : null;
  const expired =
    !!expiresDate &&
    !isNaN(expiresDate.getTime()) &&
    expiresDate.getTime() <= Date.now();
  const effectiveActive =
    active && promoText.trim().length > 0 && !expired;

  return (
    <Card className="overflow-hidden border-primary/30">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40">
          <div className="flex items-center gap-3">
            <span className="text-lg">🔥</span>
            <div>
              <div className="font-medium flex items-center gap-2">
                Promoção do Dia
                {effectiveActive ? (
                  <Badge variant="default" className="text-[10px]">Ativa no prompt</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">Inativa</Badge>
                )}
                {expired && (
                  <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400 text-[10px]">
                    Expirada
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Texto livre injetado no prompt quando ativa. Sem afetar módulos. Isolada por workspace.
              </div>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t bg-muted/10 p-4">
          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor="promo_text" className="text-xs">Texto da promoção</Label>
              <Textarea
                id="promo_text"
                rows={4}
                value={promoText}
                onChange={(e) => setPromoText(e.target.value)}
                placeholder="ex.: 1000 seguidores TikTok Global - R$ 10,00 com reposição por 30 dias"
                className="font-mono text-sm"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Switch checked={active} onCheckedChange={setActive} />
                <Label className="text-xs">Promoção ativa</Label>
              </div>
              <div>
                <Label htmlFor="expires_at" className="text-xs">
                  Validade (opcional — desativa após essa data/hora)
                </Label>
                <Input
                  id="expires_at"
                  type="datetime-local"
                  value={expiresLocal}
                  onChange={(e) => setExpiresLocal(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {save.isPending ? "Salvando…" : "Salvar promoção"}
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
