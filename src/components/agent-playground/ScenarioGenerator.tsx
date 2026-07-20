import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface ScenarioGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (scenario: any) => void;
}

const SCENARIOS = [
  { id: "novo", label: "Cliente novo", category: "Geral" },
  { id: "quente", label: "Cliente quente", category: "Geral" },
  { id: "desconfiado", label: "Cliente desconfiado", category: "Geral" },
  { id: "spotify", label: "Spotify", category: "Redes" },
  { id: "instagram", label: "Instagram", category: "Redes" },
  { id: "youtube", label: "YouTube", category: "Redes" },
  { id: "pagamento_recusado", label: "Pagamento recusado", category: "Pagamentos" },
  { id: "pix_manual", label: "Pix manual", category: "Pagamentos" },
];

export function ScenarioGenerator({ open, onOpenChange, onGenerate }: ScenarioGeneratorProps) {
  const [selectedScenario, setSelectedScenario] = useState("");
  const [tone, setTone] = useState("educado");
  const [stage, setStage] = useState("inicio");
  const [count, setCount] = useState("5");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Gerador de Cenários</DialogTitle>
          <DialogDescription>
            Escolha um template para gerar um histórico de conversa determinístico.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Cenário</Label>
            <Select value={selectedScenario} onValueChange={setSelectedScenario}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um cenário..." />
              </SelectTrigger>
              <SelectContent>
                {SCENARIOS.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label} <Badge variant="outline" className="ml-2 text-[10px]">{s.category}</Badge>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Tom do cliente</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="educado">Educado</SelectItem>
                  <SelectItem value="direto">Direto</SelectItem>
                  <SelectItem value="desconfiado">Desconfiado</SelectItem>
                  <SelectItem value="irritado">Irritado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Estágio</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inicio">Início</SelectItem>
                  <SelectItem value="negociacao">Negociação</SelectItem>
                  <SelectItem value="fechamento">Fechamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Quantidade de mensagens</Label>
            <Select value={count} onValueChange={setCount}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Limpa (0)</SelectItem>
                <SelectItem value="5">Curta (5)</SelectItem>
                <SelectItem value="10">Média (10)</SelectItem>
                <SelectItem value="20">Longa (20)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onGenerate({ selectedScenario, tone, stage, count })}>Gerar cenário</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
