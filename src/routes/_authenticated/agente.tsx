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
import { getAgentConfig, saveAgentModules, setServicesRealtime, saveBehavior, savePanelScreenshots } from "@/lib/agent.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_MODULES, MODULE_LIST } from "@/lib/agent-modules";
import { TesteGratisCard } from "@/components/agente/TesteGratisCard";
import { supabase } from "@/integrations/supabase/client";

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
  const saveBehaviorFn = useServerFn(saveBehavior);
  const savePanelShotsFn = useServerFn(savePanelScreenshots);
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

  const cfgB = cfg as {
    response_delay_min_sec?: number;
    response_delay_max_sec?: number;
    typing_indicator_enabled?: boolean;
  } | null | undefined;
  const [delayMin, setDelayMin] = useState<number>(30);
  const [delayMax, setDelayMax] = useState<number>(120);
  const [presenceOn, setPresenceOn] = useState<boolean>(true);
  useEffect(() => {
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
          <div className="font-medium flex items-center gap-2 mb-1">
            <span>⏱️</span> Comportamento humanizado
          </div>
          <p className="text-xs text-muted-foreground mb-3 max-w-xl">
            Antes de responder, o agente espera um tempo aleatório entre o mínimo
            e o máximo e envia "digitando..." (ou "gravando..." para áudio) durante
            esse intervalo.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="delayMin" className="text-xs">Delay mínimo (s)</Label>
              <Input
                id="delayMin" type="number" min={0} max={600}
                value={delayMin}
                onChange={(e) => setDelayMin(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label htmlFor="delayMax" className="text-xs">Delay máximo (s)</Label>
              <Input
                id="delayMax" type="number" min={0} max={600}
                value={delayMax}
                onChange={(e) => setDelayMax(Number(e.target.value) || 0)}
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex items-center gap-2 pb-1">
                <Switch checked={presenceOn} onCheckedChange={setPresenceOn} />
                <Label className="text-xs">Mostrar status de presença</Label>
              </div>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={() => saveBehaviorMut.mutate()} disabled={saveBehaviorMut.isPending}>
              {saveBehaviorMut.isPending ? "Salvando..." : "Salvar comportamento"}
            </Button>
          </div>
        </Card>
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
                  {m.key === "guia_visual_painel" && (
                    <PanelScreenshotsSlots
                      mobileList={normalizeShotList(
                        (cfg as PanelShotsCfg | null | undefined)?.panel_screenshots_mobile,
                        (cfg as PanelShotsCfg | null | undefined)?.panel_screenshot_mobile_url,
                      )}
                      desktopList={normalizeShotList(
                        (cfg as PanelShotsCfg | null | undefined)?.panel_screenshots_desktop,
                        (cfg as PanelShotsCfg | null | undefined)?.panel_screenshot_desktop_url,
                      )}
                      onSaved={async (patch) => {
                        await savePanelShotsFn({ data: patch });
                        await qc.invalidateQueries({ queryKey: ["agent_config"] });
                      }}
                    />
                  )}
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

type PanelShot = { url: string; path?: string; label?: string };
type PanelShotsCfg = {
  panel_screenshot_mobile_url?: string | null;
  panel_screenshot_desktop_url?: string | null;
  panel_screenshots_mobile?: PanelShot[] | null;
  panel_screenshots_desktop?: PanelShot[] | null;
};

function normalizeShotList(
  list: PanelShot[] | null | undefined,
  legacyUrl: string | null | undefined,
): PanelShot[] {
  if (Array.isArray(list) && list.length > 0) return list;
  if (legacyUrl) return [{ url: legacyUrl }];
  return [];
}

type SavePatch = {
  panel_screenshots_mobile?: PanelShot[];
  panel_screenshots_desktop?: PanelShot[];
  panel_screenshot_mobile_url?: string | null;
  panel_screenshot_desktop_url?: string | null;
};

function PanelScreenshotsSlots({
  mobileList,
  desktopList,
  onSaved,
}: {
  mobileList: PanelShot[];
  desktopList: PanelShot[];
  onSaved: (patch: SavePatch) => Promise<void>;
}) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <PanelShotGroup
        label="📱 Painel no celular"
        kind="mobile"
        items={mobileList}
        onChange={(next) =>
          onSaved({
            panel_screenshots_mobile: next,
            panel_screenshot_mobile_url: next[0]?.url ?? null,
          })
        }
      />
      <PanelShotGroup
        label="🖥️ Painel no desktop"
        kind="desktop"
        items={desktopList}
        onChange={(next) =>
          onSaved({
            panel_screenshots_desktop: next,
            panel_screenshot_desktop_url: next[0]?.url ?? null,
          })
        }
      />
    </div>
  );
}

function PanelShotGroup({
  label,
  kind,
  items,
  onChange,
}: {
  label: string;
  kind: "mobile" | "desktop";
  items: PanelShot[];
  onChange: (next: PanelShot[]) => Promise<void>;
}) {
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
        const { error: upErr } = await supabase.storage
          .from("panel-guide")
          .upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) throw upErr;
        const { data: signed, error: sErr } = await supabase.storage
          .from("panel-guide")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        if (sErr || !signed) throw sErr ?? new Error("Falha ao gerar URL.");
        uploaded.push({ url: signed.signedUrl, path, label: file.name.replace(/\.[^.]+$/, "") });
      }
      await onChange([...items, ...uploaded]);
      toast.success(`${uploaded.length} imagem(ns) adicionada(s)`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(idx: number) {
    const next = items.filter((_, i) => i !== idx);
    await onChange(next);
  }

  async function updateLabel(idx: number, value: string) {
    const next = items.map((it, i) => (i === idx ? { ...it, label: value } : it));
    await onChange(next);
  }

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{items.length} imagem(ns)</div>
      </div>
      {items.length === 0 ? (
        <div className="mb-2 flex h-24 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
          Nenhuma imagem enviada
        </div>
      ) : (
        <div className="mb-2 grid grid-cols-2 gap-2">
          {items.map((it, idx) => (
            <div key={`${it.url}-${idx}`} className="rounded border bg-card p-2">
              <img
                src={it.url}
                alt={it.label ?? `${label} ${idx + 1}`}
                className="mb-1 h-28 w-full rounded object-contain"
              />
              <Input
                value={it.label ?? ""}
                placeholder="Ex.: tela de pedidos"
                onChange={(e) => void updateLabel(idx, e.target.value)}
                className="mb-1 h-7 text-xs"
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void remove(idx)}
                className="h-7 w-full text-xs"
              >
                Remover
              </Button>
            </div>
          ))}
        </div>
      )}
      <Input
        type="file"
        accept="image/*"
        multiple
        disabled={busy}
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) void handleFiles(files);
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}
