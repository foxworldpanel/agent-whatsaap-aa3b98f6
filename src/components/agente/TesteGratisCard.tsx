import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Gift, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  syncSmmServices,
  listFreeTestServices,
  upsertFreeTestService,
  listCatalogCache,
  type ServiceRow,
} from "@/lib/smm-services.functions";
import { listFreeTrials } from "@/lib/free-trials.functions";
import { getAgentConfig, setCatalogFlags } from "@/lib/agent.functions";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-warning/20 text-warning",
  processing: "bg-primary/20 text-primary",
  in_progress: "bg-primary/20 text-primary",
  completed: "bg-success/20 text-success",
  partial: "bg-warning/20 text-warning",
  failed: "bg-destructive/20 text-destructive",
  canceled: "bg-muted text-muted-foreground",
  timeout: "bg-destructive/20 text-destructive",
};

function detectPlatform(name: string, category: string) {
  const s = `${name} ${category}`.toLowerCase();
  if (s.includes("instagram") || s.includes("insta ")) return "Instagram";
  if (s.includes("tiktok") || s.includes("tik tok")) return "TikTok";
  if (s.includes("youtube") || s.includes("yt ")) return "YouTube";
  if (s.includes("spotify")) return "Spotify";
  if (s.includes("facebook") || s.includes("fb ")) return "Facebook";
  if (s.includes("kwai")) return "Kwai";
  if (s.includes("twitter") || s.includes(" x ")) return "Twitter/X";
  if (s.includes("google")) return "Google";
  return "—";
}

export function TesteGratisCard() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [filter, setFilter] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { enabled: boolean; quantity: number }>>({});

  const syncFn = useServerFn(syncSmmServices);
  const listFts = useServerFn(listFreeTestServices);
  const upsertFts = useServerFn(upsertFreeTestService);
  const listTrialsFn = useServerFn(listFreeTrials);
  const listCacheFn = useServerFn(listCatalogCache);
  const getCfg = useServerFn(getAgentConfig);
  const setFlags = useServerFn(setCatalogFlags);

  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const { data: cfg } = useQuery({
    queryKey: ["agent_config"],
    queryFn: () => getCfg(),
  });
  const catalogInPrompt = (cfg as { catalog_in_prompt?: boolean } | undefined)?.catalog_in_prompt ?? true;
  const catalogOnlyRelevant = (cfg as { catalog_only_relevant?: boolean } | undefined)?.catalog_only_relevant ?? true;

  const flagsMut = useMutation({
    mutationFn: (p: { catalog_in_prompt?: boolean; catalog_only_relevant?: boolean }) => setFlags({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent_config"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: ftsList = [] } = useQuery({
    queryKey: ["free_test_services"],
    queryFn: () => listFts(),
    enabled: open,
  });
  // Carrega catálogo em cache ao abrir
  useQuery({
    queryKey: ["catalog_cache"],
    enabled: open,
    queryFn: async () => {
      const res = await listCacheFn();
      setServices(res.services);
      setLastSyncAt(res.last_sync_at);
      return res;
    },
  });
  const { data: trials = [] } = useQuery({
    queryKey: ["free-trials"],
    queryFn: () => listTrialsFn(),
    enabled: open,
    refetchInterval: open ? 30000 : false,
  });

  const ftsByService = useMemo(() => {
    const map: Record<string, { enabled: boolean; quantity: number; name: string; category: string }> = {};
    for (const r of ftsList as Array<{ service_id: string; enabled: boolean; quantity: number; service_name: string; category: string }>) {
      map[r.service_id] = { enabled: r.enabled, quantity: r.quantity, name: r.service_name, category: r.category };
    }
    return map;
  }, [ftsList]);

  // Initialize drafts when services or saved config change
  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const s of services) {
        if (!next[s.service]) {
          const saved = ftsByService[s.service];
          next[s.service] = {
            enabled: saved?.enabled ?? false,
            quantity: saved?.quantity ?? Math.max(parseInt(s.min, 10) || 100, 100),
          };
        }
      }
      // Also include saved services not present in API result (so user can still toggle)
      for (const id of Object.keys(ftsByService)) {
        if (!next[id]) next[id] = { enabled: ftsByService[id].enabled, quantity: ftsByService[id].quantity };
      }
      return next;
    });
  }, [services, ftsByService]);

  const sync = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error || "Falha ao sincronizar");
        return;
      }
      setServices(res.services);
      setLastSyncAt(new Date().toISOString());
      qc.invalidateQueries({ queryKey: ["catalog_cache"] });
      toast.success(`${res.count} serviços carregados`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: (payload: { service_id: string; service_name: string; category: string; quantity: number; enabled: boolean }) =>
      upsertFts({ data: payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["free_test_services"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) =>
      `${s.service} ${s.name} ${s.category}`.toLowerCase().includes(q),
    );
  }, [services, filter]);

  const activeCount = Object.values(drafts).filter((d) => d.enabled).length;

  return (
    <Card className="overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40">
          <div className="flex items-center gap-3">
            <Gift className="h-5 w-5 text-primary" />
            <div>
              <div className="font-medium">Teste Grátis</div>
              <div className="text-xs text-muted-foreground">
                {activeCount} serviço(s) ativos · {trials.length} testes no histórico
              </div>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 border-t bg-muted/10 p-4">
          {/* Regras */}
          <div className="rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
            <p className="mb-1 font-medium text-foreground">Regras do teste</p>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>1 teste por número de telefone</li>
              <li>1 teste por link/perfil</li>
              <li>Trava dupla: bloqueia se telefone OU link já usou</li>
              <li>Só oferece teste de serviços com toggle ativo</li>
              <li>Monitoramento automático a cada 5 minutos; notifica o cliente ao completar</li>
            </ul>
          </div>

          {/* Sync button */}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
              <RefreshCw className={`mr-2 h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} />
              {sync.isPending ? "Sincronizando..." : "Sincronizar catálogo"}
            </Button>
            {(lastSyncAt || services.length > 0) && (
              <span className="text-xs text-muted-foreground">
                Catálogo sincronizado: {services.length} serviços
                {lastSyncAt ? ` — ${new Date(lastSyncAt).toLocaleString("pt-BR")}` : ""}
              </span>
            )}
            <div className="relative ml-auto w-64">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar serviços..."
                className="pl-7 h-8"
              />
            </div>
          </div>

          {/* Toggles do catálogo */}
          <div className="grid gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-2">
            <label className="flex items-start justify-between gap-3">
              <div className="text-xs">
                <div className="font-medium text-foreground">Incluir catálogo no prompt</div>
                <div className="text-muted-foreground">Passa os serviços ao Claude em cada mensagem.</div>
              </div>
              <Switch
                checked={catalogInPrompt}
                onCheckedChange={(v) => flagsMut.mutate({ catalog_in_prompt: v })}
              />
            </label>
            <label className="flex items-start justify-between gap-3">
              <div className="text-xs">
                <div className="font-medium text-foreground">Incluir apenas serviços relevantes</div>
                <div className="text-muted-foreground">Filtra pelo assunto detectado na conversa.</div>
              </div>
              <Switch
                checked={catalogOnlyRelevant}
                onCheckedChange={(v) => flagsMut.mutate({ catalog_only_relevant: v })}
              />
            </label>
          </div>

          {/* Services table */}
          <div className="overflow-auto rounded-md border max-h-[420px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left font-medium">ID</th>
                  <th className="px-2 py-2 text-left font-medium">Nome</th>
                  <th className="px-2 py-2 text-left font-medium">Plataforma</th>
                  <th className="px-2 py-2 text-right font-medium">R$/1000</th>
                  <th className="px-2 py-2 text-right font-medium">Mín</th>
                  <th className="px-2 py-2 text-right font-medium">Máx</th>
                  <th className="px-2 py-2 text-center font-medium">Teste</th>
                  <th className="px-2 py-2 text-right font-medium">Qtd</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((s) => {
                  const d = drafts[s.service] ?? { enabled: false, quantity: parseInt(s.min, 10) || 100 };
                  return (
                    <tr key={s.service} className="hover:bg-muted/20">
                      <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{s.service}</td>
                      <td className="px-2 py-1.5">{s.name}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{detectPlatform(s.name, s.category)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{s.rate}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{s.min}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{s.max}</td>
                      <td className="px-2 py-1.5 text-center">
                        <Switch
                          checked={d.enabled}
                          onCheckedChange={(v) => {
                            const quantity = d.quantity || parseInt(s.min, 10) || 100;
                            setDrafts((prev) => ({ ...prev, [s.service]: { ...d, enabled: v, quantity } }));
                            save.mutate({
                              service_id: s.service,
                              service_name: s.name,
                              category: s.category,
                              quantity,
                              enabled: v,
                            });
                          }}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <Input
                          type="number"
                          value={d.quantity}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [s.service]: { ...d, quantity: Number(e.target.value) || 0 },
                            }))
                          }
                          onBlur={() =>
                            save.mutate({
                              service_id: s.service,
                              service_name: s.name,
                              category: s.category,
                              quantity: d.quantity || 100,
                              enabled: d.enabled,
                            })
                          }
                          className="h-7 w-24 text-right text-xs"
                        />
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-2 py-8 text-center text-muted-foreground">
                      {services.length === 0
                        ? "Clique em 'Sincronizar serviços' para carregar o catálogo do painel."
                        : "Nenhum serviço corresponde ao filtro."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Trials history */}
          <div>
            <p className="mb-2 text-sm font-medium">Histórico de testes</p>
            <div className="overflow-auto rounded-md border max-h-[320px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">Telefone</th>
                    <th className="px-2 py-2 text-left font-medium">Link</th>
                    <th className="px-2 py-2 text-left font-medium">Rede</th>
                    <th className="px-2 py-2 text-left font-medium">Order</th>
                    <th className="px-2 py-2 text-right font-medium">Qtd</th>
                    <th className="px-2 py-2 text-left font-medium">Status</th>
                    <th className="px-2 py-2 text-left font-medium">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(trials as Array<{ id: string; telefone: string; link_enviado: string; servico: string | null; order_id: string | null; quantidade: number | null; status: string; criado_em: string }>).map((t) => (
                    <tr key={t.id} className="hover:bg-muted/20">
                      <td className="px-2 py-1.5 tabular-nums">{t.telefone}</td>
                      <td className="px-2 py-1.5 max-w-[220px] truncate" title={t.link_enviado}>
                        {t.link_enviado || "—"}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {detectPlatform(t.servico ?? "", t.link_enviado)}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{t.order_id ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{t.quantidade ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 ${STATUS_STYLE[t.status] ?? "bg-muted text-muted-foreground"}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {t.criado_em ? new Date(t.criado_em).toLocaleString("pt-BR") : "—"}
                      </td>
                    </tr>
                  ))}
                  {trials.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-2 py-8 text-center text-muted-foreground">
                        Nenhum teste registrado ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}