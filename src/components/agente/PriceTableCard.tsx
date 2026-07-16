import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getPriceTable, savePriceTable } from "@/lib/agent.functions";
import { useWorkspace } from "@/contexts/workspace-context";

type PriceRow = {
  id?: string;
  platform: string;
  service: string;
  audience: string;
  price_per_1000: number;
  min_quantity: number;
  max_quantity: number;
  is_active: boolean;
};

export function PriceTableCard() {
  const qc = useQueryClient();
  const { activeWorkspaceId } = useWorkspace();
  const fetchFn = useServerFn(getPriceTable);
  const saveFn = useServerFn(savePriceTable);

  const { data } = useQuery({
    queryKey: ["price_table", activeWorkspaceId],
    queryFn: () => fetchFn(),
  });

  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PriceRow[]>([]);

  useEffect(() => {
    if (data) {
      setRows(data as PriceRow[]);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { rows } }),
    onSuccess: () => {
      toast.success("Tabela de preços salva");
      qc.invalidateQueries({ queryKey: ["price_table"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addRow = () => {
    setRows([
      ...rows,
      {
        platform: "",
        service: "",
        audience: "Brasil",
        price_per_1000: 0,
        min_quantity: 100,
        max_quantity: 100000,
        is_active: true,
      },
    ]);
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof PriceRow, value: any) => {
    const next = [...rows];
    next[index] = { ...next[index], [field]: value };
    setRows(next);
  };

  return (
    <Card className="overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40">
          <div className="flex items-center gap-3">
            <span className="text-lg">🏷️</span>
            <div>
              <div className="font-medium">Tabela de Preços Manual</div>
              <div className="text-xs text-muted-foreground">
                Define os serviços e preços que o agente deve usar. Ignora a API quando configurada.
              </div>
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t bg-muted/10 p-4">
          <div className="flex flex-col gap-4">
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Plataforma</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead className="w-[100px]">Público</TableHead>
                    <TableHead className="w-[110px]">Preço/1000</TableHead>
                    <TableHead className="w-[90px]">Mín</TableHead>
                    <TableHead className="w-[90px]">Máx</TableHead>
                    <TableHead className="w-[60px]">Ativo</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="p-2">
                        <Input
                          value={row.platform}
                          onChange={(e) => updateRow(idx, "platform", e.target.value)}
                          placeholder="Spotify, YT..."
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell className="p-2">
                        <Input
                          value={row.service}
                          onChange={(e) => updateRow(idx, "service", e.target.value)}
                          placeholder="Seguidores, Plays..."
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell className="p-2">
                        <Input
                          value={row.audience}
                          onChange={(e) => updateRow(idx, "audience", e.target.value)}
                          placeholder="Brasil..."
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell className="p-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={row.price_per_1000}
                          onChange={(e) => updateRow(idx, "price_per_1000", Number(e.target.value))}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell className="p-2">
                        <Input
                          type="number"
                          value={row.min_quantity}
                          onChange={(e) => updateRow(idx, "min_quantity", Number(e.target.value))}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell className="p-2">
                        <Input
                          type="number"
                          value={row.max_quantity}
                          onChange={(e) => updateRow(idx, "max_quantity", Number(e.target.value))}
                          className="h-8 text-xs"
                        />
                      </TableCell>
                      <TableCell className="p-2">
                        <Switch
                          checked={row.is_active}
                          onCheckedChange={(v) => updateRow(idx, "is_active", v)}
                        />
                      </TableCell>
                      <TableCell className="p-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => removeRow(idx)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground text-xs">
                        Nenhum serviço adicionado. Clique em "+ Adicionar serviço" para começar.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-between items-center">
              <Button variant="outline" size="sm" onClick={addRow}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar serviço
              </Button>
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {save.isPending ? "Salvando..." : "Salvar tabela"}
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
