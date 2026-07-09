import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Trash2, Pencil, Plus } from "lucide-react";
import {
  listAgentMedias,
  upsertAgentMedia,
  deleteAgentMedia,
  toggleAgentMedia,
  type AgentMedia,
  type AgentMediaTipo,
} from "@/lib/agent-medias.functions";
import { MediaFormDialog } from "./MediaFormDialog";
import { useWorkspace } from "@/contexts/workspace-context";

export function MediasCard({ tipo, title, emoji }: { tipo: AgentMediaTipo; title: string; emoji: string }) {
  const qc = useQueryClient();
  const { activeWorkspaceId } = useWorkspace();
  const listFn = useServerFn(listAgentMedias);
  const upsertFn = useServerFn(upsertAgentMedia);
  const delFn = useServerFn(deleteAgentMedia);
  const toggleFn = useServerFn(toggleAgentMedia);

  const { data = [] } = useQuery({
    queryKey: ["agent_medias", tipo, activeWorkspaceId],
    queryFn: () => listFn({ data: { tipo } }) as Promise<AgentMedia[]>,
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AgentMedia | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["agent_medias", tipo, activeWorkspaceId] });

  const toggle = useMutation({
    mutationFn: (v: { id: string; ativo: boolean }) => toggleFn({ data: v }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); invalidate(); },
  });

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-medium flex items-center gap-2">
          <span>{emoji}</span> {title}
          <span className="text-xs text-muted-foreground">({data.length})</span>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar
        </Button>
      </div>
      {data.length === 0 ? (
        <div className="text-xs text-muted-foreground py-6 text-center">
          Nenhum {tipo === "video" ? "vídeo" : "arte"} cadastrado ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded border p-2">
              {m.tipo === "imagem" ? (
                <img src={m.url} alt={m.nome} className="h-12 w-12 rounded object-cover" />
              ) : (
                <div className="h-12 w-12 rounded bg-muted flex items-center justify-center text-lg">🎬</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{m.nome}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  <Badge variant="secondary" className="text-[10px]">{m.plataforma}</Badge>
                  {m.auto_no_inicio && <Badge className="text-[10px]">auto início</Badge>}
                  {m.data_fim && new Date(m.data_fim) < new Date() && (
                    <Badge variant="destructive" className="text-[10px]">expirado</Badge>
                  )}
                  {(m.gatilhos ?? []).slice(0, 3).map((g) => (
                    <Badge key={g} variant="outline" className="text-[10px]">{g}</Badge>
                  ))}
                  {(m.gatilhos ?? []).length > 3 && (
                    <Badge variant="outline" className="text-[10px]">+{m.gatilhos.length - 3}</Badge>
                  )}
                </div>
              </div>
              <Switch checked={m.ativo} onCheckedChange={(v) => toggle.mutate({ id: m.id, ativo: v })} />
              <Button size="icon" variant="ghost" onClick={() => { setEditing(m); setOpen(true); }}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => remove.mutate(m.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <MediaFormDialog
        open={open}
        onOpenChange={setOpen}
        tipo={tipo}
        initial={editing}
        onSubmit={async (payload) => {
          await upsertFn({ data: payload });
          toast.success("Salvo");
          invalidate();
        }}
      />
    </Card>
  );
}