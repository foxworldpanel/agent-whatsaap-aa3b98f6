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
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  getPlaylistPackageConfig,
  savePlaylistPackageConfig,
  listPlaylistSales,
} from "@/lib/playlist-config.functions";

type Cfg = {
  playlist_pix_key: string;
  playlist_pix_holder: string;
  playlist_price: number;
  playlist_ecletica_service_id: string | null;
  playlist_eletronica_service_id: string | null;
  playlist_ecletica_links: string[];
  playlist_eletronica_links: string[];
};

export function PlaylistCard() {
  const qc = useQueryClient();
  const fetchCfg = useServerFn(getPlaylistPackageConfig);
  const saveCfg = useServerFn(savePlaylistPackageConfig);
  const fetchSales = useServerFn(listPlaylistSales);

  const { data } = useQuery({ queryKey: ["playlist_pkg_cfg"], queryFn: () => fetchCfg() });
  const { data: sales } = useQuery({ queryKey: ["playlist_sales_recent"], queryFn: () => fetchSales() });

  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [ecleticaLinksText, setEcleticaLinksText] = useState("");
  const [eletronicaLinksText, setEletronicaLinksText] = useState("");

  useEffect(() => {
    if (!data) return;
    const d = data as Cfg;
    setCfg(d);
    setEcleticaLinksText((d.playlist_ecletica_links ?? []).join("\n"));
    setEletronicaLinksText((d.playlist_eletronica_links ?? []).join("\n"));
  }, [data]);

  const save = useMutation({
    mutationFn: (payload: Cfg) => saveCfg({ data: payload }),
    onSuccess: () => {
      toast.success("Configuração dos Pacotes de Playlist salva");
      qc.invalidateQueries({ queryKey: ["playlist_pkg_cfg"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!cfg) return <Card className="p-4 text-sm text-muted-foreground">Carregando pacotes de playlist…</Card>;

  const submit = () => {
    const parseLinks = (t: string) =>
      t.split("\n").map((s) => s.trim()).filter((s) => s.length > 0);
    save.mutate({
      ...cfg,
      playlist_ecletica_links: parseLinks(ecleticaLinksText),
      playlist_eletronica_links: parseLinks(eletronicaLinksText),
    });
  };

  const missing =
    !cfg.playlist_ecletica_service_id ||
    !cfg.playlist_eletronica_service_id ||
    (cfg.playlist_ecletica_links ?? []).length === 0 ||
    (cfg.playlist_eletronica_links ?? []).length === 0;

  return (
    <Card className="overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40">
          <div className="flex items-center gap-3">
            <span className="text-lg">🎼</span>
            <div>
              <div className="font-medium flex items-center gap-2">
                Pacotes de Playlist (Promoção)
                {missing && (
                  <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400 text-[10px]">
                    Config incompleta
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                PIX, valor, IDs dos serviços no painel Mind e links das playlists por pacote.
              </div>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t bg-muted/10 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Chave PIX</Label>
              <Input
                value={cfg.playlist_pix_key}
                onChange={(e) => setCfg({ ...cfg, playlist_pix_key: e.target.value })}
              />
            </div>
            <div>
              <Label>Titular do PIX</Label>
              <Input
                value={cfg.playlist_pix_holder}
                onChange={(e) => setCfg({ ...cfg, playlist_pix_holder: e.target.value })}
              />
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={cfg.playlist_price}
                onChange={(e) => setCfg({ ...cfg, playlist_price: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium mb-2">Pacote Eclética</div>
              <Label className="text-xs">Service ID no painel Mind</Label>
              <Input
                placeholder="ex.: 12345"
                value={cfg.playlist_ecletica_service_id ?? ""}
                onChange={(e) =>
                  setCfg({ ...cfg, playlist_ecletica_service_id: e.target.value || null })
                }
              />
              <Label className="text-xs mt-2 block">Links das playlists (1 por linha)</Label>
              <Textarea
                rows={6}
                className="font-mono text-xs"
                placeholder="https://open.spotify.com/playlist/..."
                value={ecleticaLinksText}
                onChange={(e) => setEcleticaLinksText(e.target.value)}
              />
            </div>
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium mb-2">Pacote Música Eletrônica</div>
              <Label className="text-xs">Service ID no painel Mind</Label>
              <Input
                placeholder="ex.: 12346"
                value={cfg.playlist_eletronica_service_id ?? ""}
                onChange={(e) =>
                  setCfg({ ...cfg, playlist_eletronica_service_id: e.target.value || null })
                }
              />
              <Label className="text-xs mt-2 block">Links das playlists (1 por linha)</Label>
              <Textarea
                rows={6}
                className="font-mono text-xs"
                placeholder="https://open.spotify.com/playlist/..."
                value={eletronicaLinksText}
                onChange={(e) => setEletronicaLinksText(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button onClick={submit} disabled={save.isPending}>
              <Save className="mr-2 h-4 w-4" /> {save.isPending ? "Salvando…" : "Salvar pacotes"}
            </Button>
          </div>

          <div className="mt-6">
            <div className="text-sm font-medium mb-2">Vendas recentes</div>
            <div className="text-xs text-muted-foreground mb-2">
              Últimas 50 vendas registradas pelo fluxo do agente.
            </div>
            <div className="rounded-md border divide-y max-h-72 overflow-auto text-xs">
              {(sales ?? []).length === 0 && (
                <div className="p-3 text-muted-foreground">Nenhuma venda registrada ainda.</div>
              )}
              {(sales ?? []).map((s) => (
                <div key={s.id} className="p-2 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono truncate">{s.telefone} · {s.pacote}</div>
                    <div className="text-muted-foreground truncate">{s.music_link ?? "—"}</div>
                  </div>
                  <Badge
                    variant={
                      s.status === "completo"
                        ? "default"
                        : s.status === "erro"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {s.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}