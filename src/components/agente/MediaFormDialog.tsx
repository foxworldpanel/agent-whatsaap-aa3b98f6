import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { AgentMedia, AgentMediaInput, AgentMediaTipo } from "@/lib/agent-medias.functions";

const PLATAFORMAS = ["geral", "spotify", "youtube", "instagram", "tiktok", "kwai", "facebook"];

export function MediaFormDialog({
  open,
  onOpenChange,
  tipo,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tipo: AgentMediaTipo;
  initial?: AgentMedia | null;
  onSubmit: (payload: AgentMediaInput) => Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [url, setUrl] = useState("");
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [plataforma, setPlataforma] = useState("geral");
  const [gatilhosStr, setGatilhosStr] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [autoInicio, setAutoInicio] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(initial?.nome ?? "");
    setUrl(initial?.url ?? "");
    setStoragePath(initial?.storage_path ?? null);
    setPlataforma(initial?.plataforma ?? "geral");
    setGatilhosStr((initial?.gatilhos ?? []).join(", "));
    setDataInicio(initial?.data_inicio ? initial.data_inicio.slice(0, 10) : "");
    setDataFim(initial?.data_fim ? initial.data_fim.slice(0, 10) : "");
    setAtivo(initial?.ativo ?? true);
    setAutoInicio(initial?.auto_no_inicio ?? false);
  }, [open, initial]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Sessão expirada");
      const ext = (file.name.split(".").pop() || (tipo === "video" ? "mp4" : "png")).toLowerCase();
      const path = `${uid}/${tipo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("agent-medias").upload(path, file, {
        upsert: true, contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("agent-medias").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (sErr || !signed) throw sErr ?? new Error("Falha ao gerar URL");
      setUrl(signed.signedUrl);
      setStoragePath(path);
      toast.success("Arquivo enviado");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const payload: AgentMediaInput = {
        id: initial?.id,
        tipo,
        nome,
        url,
        storage_path: storagePath,
        plataforma,
        gatilhos: gatilhosStr.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
        data_inicio: dataInicio ? new Date(dataInicio).toISOString() : null,
        data_fim: dataFim ? new Date(dataFim + "T23:59:59").toISOString() : null,
        ativo,
        auto_no_inicio: tipo === "imagem" ? autoInicio : false,
      };
      await onSubmit(payload);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar" : "Adicionar"} {tipo === "video" ? "vídeo" : "arte"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={tipo === "video" ? "Ex: Tutorial Spotify" : "Ex: Promoção Junho"} />
          </div>
          <div>
            <Label className="text-xs">Plataforma</Label>
            <Select value={plataforma} onValueChange={setPlataforma}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLATAFORMAS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {tipo === "video" ? (
            <div>
              <Label className="text-xs">URL do vídeo (YouTube, Drive ou .mp4)</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/..." />
              <div className="mt-2 text-xs text-muted-foreground">ou envie um arquivo:</div>
              <Input type="file" accept="video/mp4,video/*" disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.currentTarget.value = ""; }} />
            </div>
          ) : (
            <div>
              <Label className="text-xs">Imagem</Label>
              {url && <img src={url} alt="preview" className="mb-2 h-32 w-full rounded object-contain border" />}
              <Input type="file" accept="image/*" disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.currentTarget.value = ""; }} />
            </div>
          )}
          <div>
            <Label className="text-xs">Gatilhos (separados por vírgula)</Label>
            <Textarea rows={2} value={gatilhosStr} onChange={(e) => setGatilhosStr(e.target.value)}
              placeholder="não sei comprar, como funciona, estou perdido" />
          </div>
          {tipo === "imagem" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Início</Label>
                <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Fim</Label>
                <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between rounded border p-2">
            <div>
              <div className="text-sm font-medium">Ativo</div>
              <div className="text-xs text-muted-foreground">Se desligado, o agente não envia.</div>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>
          {tipo === "imagem" && (
            <div className="flex items-center justify-between rounded border p-2">
              <div>
                <div className="text-sm font-medium">Enviar automaticamente no início da conversa</div>
                <div className="text-xs text-muted-foreground">Dispara sem precisar de palavra-chave.</div>
              </div>
              <Switch checked={autoInicio} onCheckedChange={setAutoInicio} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving || uploading || !nome || !url}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}