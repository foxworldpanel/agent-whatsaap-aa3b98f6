import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Save, AlertTriangle, Cpu, Info, History, Shield, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { getAgentConfig, saveAgentModules, setServicesRealtime, saveBehavior, savePanelScreenshots, listModulesV2 } from "@/lib/agent.functions";
import { seedBrandFromMindTemplate } from "@/lib/seed-mind-brand.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_MODULES, MODULE_LIST } from "@/lib/agent-modules";
import { TesteGratisCard } from "@/components/agente/TesteGratisCard";
import { MediasCard } from "@/components/agente/MediasCard";
import { PlaylistCard } from "@/components/agente/PlaylistCard";
import { DailyPromoCard } from "@/components/agente/DailyPromoCard";
import { IdentidadeCard } from "@/components/agente/IdentidadeCard";
import { PriceTableCard } from "@/components/agente/PriceTableCard";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/workspace-context";

export const Route = createFileRoute("/_authenticated/agente")({
  ssr: false,
  head: () => ({ meta: [{ title: "Agente IA · ZapAgent" }] }),
  component: AgentePage,
});

function AgentePage() {
  const qc = useQueryClient();
  const { activeWorkspaceId, isLoading: isWsLoading } = useWorkspace();
  const fetchCfg = useServerFn(getAgentConfig);
  const saveFn = useServerFn(saveAgentModules);
  const toggleRealtimeFn = useServerFn(setServicesRealtime);
  const saveBehaviorFn = useServerFn(saveBehavior);
  const savePanelShotsFn = useServerFn(savePanelScreenshots);
  const fetchModulesV2 = useServerFn(listModulesV2);
  const seedTplFn = useServerFn(seedBrandFromMindTemplate);

  const seedTplMut = useMutation({
    mutationFn: () => seedTplFn(),
    onSuccess: (r) => {
      toast.success(`Template Mind aplicado`);
      qc.invalidateQueries({ queryKey: ["agent_config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmAndSeedTemplate = () => {
    if (window.confirm("Aplicar o template Mind (Júlia) neste workspace?")) {
      seedTplMut.mutate();
    }
  };

  const { data: cfgRaw, isLoading: isCfgLoading, error: cfgError } = useQuery({ 
    queryKey: ["agent_config", activeWorkspaceId], 
    queryFn: () => fetchCfg(),
    enabled: !!activeWorkspaceId
  });
  
  const cfg = cfgRaw as AgentConfigUi | null | undefined;

  const [modules, setModules] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [openKey, setOpenKey] = useState<string | null>(null);

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
  const realtimeOn = (cfg as { services_realtime?: boolean } | null | undefined)?.services_realtime === true;

  const [delayMin, setDelayMin] = useState<number>(30);
  const [delayMax, setDelayMax] = useState<number>(120);
  const [presenceOn, setPresenceOn] = useState<boolean>(true);

  useEffect(() => {
    const cfgB = cfg as {
      response_delay_min_sec?: number;
      response_delay_max_sec?: number;
      typing_indicator_enabled?: boolean;
    } | null | undefined;
    setDelayMin(cfgB?.response_delay_min_sec ?? 30);
    setDelayMax(cfgB?.response_delay_max_sec ?? 120);
    setPresenceOn(cfgB?.typing_indicator_enabled !== false);
  }, [cfg]);

  const saveBehaviorMut = useMutation({
    mutationFn: () =>
      saveBehaviorFn({
        data: {
          response_delay_min_sec: delayMin,
          response_delay_max_sec: delayMax,
          typing_indicator_enabled: presenceOn,
        },
      }),
    onSuccess: () => {
      toast.success("Comportamento salvo");
      qc.invalidateQueries({ queryKey: ["agent_config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: v2ModulesData, isLoading: isV2ModulesLoading } = useQuery({
    queryKey: ["agent_modules_v2"],
    queryFn: () => fetchModulesV2(),
  });

  const [showV1, setShowV1] = useState(false);
  const v2Modules = v2ModulesData ?? [];

  if (isWsLoading || isCfgLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="mt-4 text-sm text-muted-foreground font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  if (cfgError) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar configurações</AlertTitle>
          <AlertDescription>
            {cfgError instanceof Error ? cfgError.message : "Erro desconhecido."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Cpu className="h-6 w-6 text-primary" />
            Configuração do Agente IA (V2)
          </h1>
          <p className="text-sm text-muted-foreground">
            Arquitetura modular real integrada ao runtime V2.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowV1(!showV1)} size="sm">
            <History className="mr-2 h-4 w-4" />
            {showV1 ? "Ocultar V1" : "Ver Legado V1"}
          </Button>
          <Button onClick={doSave} disabled={save.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {save.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      {!activeWorkspaceId && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Nenhum workspace selecionado</AlertTitle>
        </Alert>
      )}

      <Card className="border-dashed border-primary/40 bg-muted/20 p-4 text-xs">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">Template Mind Júlia</div>
            <div className="text-muted-foreground">Preenche persona e brand blocks.</div>
          </div>
          <Button variant="outline" size="sm" onClick={confirmAndSeedTemplate} disabled={seedTplMut.isPending}>
            {seedTplMut.isPending ? "..." : "Usar template"}
          </Button>
        </div>
      </Card>

      <div className="flex flex-col gap-4">
        {/* Módulos V2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {v2Modules.map((m: any) => (
            <Card key={m.id} className="p-4 flex flex-col gap-3 border-primary/20 hover:border-primary/40 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{m.emoji}</span>
                  <div>
                    <h3 className="font-bold text-base leading-none">{m.title}</h3>
                    <p className="text-[10px] text-muted-foreground mt-1 font-mono uppercase tracking-wider">{m.id}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase">
                    {m.category}
                  </span>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-success" />
                    <span className="text-[10px] font-medium text-success">ATIVO V2</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed flex-1">{m.description}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                <div className="flex items-center gap-1 bg-muted px-1.5 py-0.5 rounded text-[9px]">PRIO: {m.priority}</div>
                {m.modes.map((mode: string) => (
                  <div key={mode} className="bg-muted px-1.5 py-0.5 rounded text-[9px] uppercase">MODE: {mode}</div>
                ))}
                {m.dependencies.length > 0 && (
                  <div className="flex items-center gap-1 bg-warning/10 text-warning px-1.5 py-0.5 rounded text-[9px]">DEP: {m.dependencies.join(", ")}</div>
                )}
              </div>
              <div className="mt-2 pt-2 border-t border-border/50">
                <p className="text-[9px] font-mono text-muted-foreground truncate italic">{m.contentPreview}</p>
              </div>
            </Card>
          ))}
        </div>

        <div className="h-px bg-border/50 my-2" />
        
        <DailyPromoCard />
        <IdentidadeCard />
        <PlaylistCard />
        <TesteGratisCard />
        <PriceTableCard />
        <MediasCard tipo="video" title="Vídeos tutoriais" emoji="🎬" />
        <MediasCard tipo="imagem" title="Artes e promoções" emoji="🖼️" />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4 border-dashed">
            <div className="font-medium flex items-center gap-2 mb-1">⏱️ Comportamento humano</div>
            <div className="grid grid-cols-2 gap-3 mb-4 mt-2">
              <div>
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Min (s)</Label>
                <Input type="number" value={delayMin} className="h-8 text-xs" onChange={(e) => setDelayMin(Number(e.target.value) || 0)} />
              </div>
              <div>
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Max (s)</Label>
                <Input type="number" value={delayMax} className="h-8 text-xs" onChange={(e) => setDelayMax(Number(e.target.value) || 0)} />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Switch checked={presenceOn} onCheckedChange={setPresenceOn} />
                <Label className="text-xs">Presença</Label>
              </div>
              <Button size="sm" variant="outline" className="h-8" onClick={() => saveBehaviorMut.mutate()} disabled={saveBehaviorMut.isPending}>Salvar</Button>
            </div>
          </Card>

          <Card className="p-4 border-dashed">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-medium flex items-center gap-2">💰 Preços Realtime</div>
                <p className="text-[10px] text-muted-foreground mt-1">Busca via API antes da resposta.</p>
              </div>
              <Switch checked={realtimeOn} disabled={toggleRealtime.isPending} onCheckedChange={(v) => toggleRealtime.mutate(v)} />
            </div>
          </Card>
        </div>

        {showV1 && (
          <div className="mt-8 space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-3">
              <History className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-muted-foreground uppercase tracking-widest text-xs">Legado V1</h2>
            </div>
            {MODULE_LIST.map((m) => {
              const open = openKey === m.key;
              const value = modules[m.key] ?? "";
              const isOn = enabled[m.key] !== false;
              return (
                <Card key={m.key} className={`overflow-hidden ${isOn ? "" : "opacity-60"}`}>
                  <Collapsible open={open} onOpenChange={(o) => setOpenKey(o ? m.key : null)}>
                    <div className="flex w-full items-center gap-3 px-4 py-3">
                      <Switch checked={isOn} onCheckedChange={(v) => setEnabled((prev) => ({ ...prev, [m.key]: v }))} />
                      <CollapsibleTrigger className="flex flex-1 items-center justify-between gap-3 text-left">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{m.emoji}</span>
                          <div className="font-medium text-sm">{m.title}</div>
                        </div>
                        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent className="border-t bg-muted/10 p-4">
                      {m.key === "guia_visual_painel" && (
                        <PanelScreenshotsSlots
                          mobileList={normalizeShotList((cfg as any)?.panel_screenshots_mobile, (cfg as any)?.panel_screenshot_mobile_url)}
                          desktopList={normalizeShotList((cfg as any)?.panel_screenshots_desktop, (cfg as any)?.panel_screenshot_desktop_url)}
                          onSaved={async (patch) => {
                            await savePanelShotsFn({ data: patch });
                            await qc.invalidateQueries({ queryKey: ["agent_config"] });
                          }}
                        />
                      )}
                      <Textarea value={value} onChange={(e) => setModules((prev) => ({ ...prev, [m.key]: e.target.value }))} rows={10} className="font-mono text-xs" />
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" onClick={doSave} disabled={save.isPending}>Salvar</Button>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

type PanelShot = { url: string; path?: string; label?: string };
type AgentConfigUi = {
  modules?: Record<string, string>;
  modules_enabled?: Record<string, boolean>;
  services_realtime?: boolean;
  response_delay_min_sec?: number;
  response_delay_max_sec?: number;
  typing_indicator_enabled?: boolean;
  panel_screenshot_mobile_url?: string | null;
  panel_screenshot_desktop_url?: string | null;
  panel_screenshots_mobile?: PanelShot[] | null;
  panel_screenshots_desktop?: PanelShot[] | null;
};

function normalizeShotList(list: PanelShot[] | null | undefined, legacyUrl: string | null | undefined): PanelShot[] {
  if (Array.isArray(list) && list.length > 0) return list;
  if (legacyUrl) return [{ url: legacyUrl }];
  return [];
}

function PanelScreenshotsSlots({ mobileList, desktopList, onSaved }: { mobileList: PanelShot[]; desktopList: PanelShot[]; onSaved: (patch: any) => Promise<void> }) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <PanelShotGroup label="📱 Celular" kind="mobile" items={mobileList} onChange={(next) => onSaved({ panel_screenshots_mobile: next, panel_screenshot_mobile_url: next[0]?.url ?? null })} />
      <PanelShotGroup label="🖥️ Desktop" kind="desktop" items={desktopList} onChange={(next) => onSaved({ panel_screenshots_desktop: next, panel_screenshot_desktop_url: next[0]?.url ?? null })} />
    </div>
  );
}

function PanelShotGroup({ label, kind, items, onChange }: { label: string; kind: "mobile" | "desktop"; items: PanelShot[]; onChange: (next: PanelShot[]) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function handleFiles(files: FileList) {
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Sessão expirada.");
      const uploaded: PanelShot[] = [];
      for (const file of Array.from(files)) {
        const ext = (file.name.split(".").pop() || "png").toLowerCase();
        const path = `${uid}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("panel-guide").upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) throw upErr;
        const { data: signed } = await supabase.storage.from("panel-guide").createSignedUrl(path, 60 * 60 * 24 * 365);
        if (!signed) throw new Error("Falha ao gerar URL.");
        uploaded.push({ url: signed.signedUrl, path, label: file.name.replace(/\.[^.]+$/, "") });
      }
      await onChange([...items, ...uploaded]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="mb-2 text-sm font-medium">{label} ({items.length})</div>
      <Input type="file" accept="image/*" multiple disabled={busy} onChange={(e) => { e.target.files && handleFiles(e.target.files); e.currentTarget.value = ""; }} />
    </div>
  );
}
