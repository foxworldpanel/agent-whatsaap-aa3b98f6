import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "@/contexts/workspace-context";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateWorkspaceWizard } from "@/components/CreateWorkspaceWizard";

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, activeWorkspaceId, switchWorkspace, isLoading } = useWorkspace();
  const [wizardOpen, setWizardOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-xs text-muted-foreground">
        <span className="h-4 w-4 animate-pulse rounded-full bg-muted" />
        <span>Carregando workspaces…</span>
      </div>
    );
  }

  const MIND_ID = "bd59fa41-d68d-4ac8-b995-e09ae48f52aa";
  const effectiveWorkspaces = workspaces.length > 0 
    ? workspaces 
    : (activeWorkspaceId === MIND_ID ? [{ id: MIND_ID, nome: "Mind SMM Panel", icone: "🧠", cor: "blue", is_default: true }] : []);

  if (!effectiveWorkspaces.length) {
    return (
      <div className="mx-3 mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        Nenhum workspace válido encontrado. Selecione ou solicite acesso ao workspace Mind.
      </div>
    );
  }

  const active = activeWorkspace || effectiveWorkspaces.find(w => w.id === activeWorkspaceId);

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "mx-3 mt-3 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-left text-sm font-medium text-sidebar-foreground transition hover:bg-sidebar-accent",
          )}
        >
          <span className="text-lg leading-none">{activeWorkspace?.icone ?? "📱"}</span>
          <span className="flex-1 truncate">{activeWorkspace?.nome ?? "Selecionar workspace"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Trocar de workspace
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((w) => {
          const isActive = w.id === activeWorkspaceId;
          return (
            <DropdownMenuItem
              key={w.id}
              onClick={() => switchWorkspace(w.id)}
              className="flex items-center gap-2"
            >
              <span className="text-base leading-none">{w.icone}</span>
              <span className="flex-1 truncate">{w.nome}</span>
              {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setWizardOpen(true)}
          className="flex items-center gap-2 text-primary focus:text-primary"
        >
          <Plus className="h-4 w-4" />
          <span className="flex-1">Criar novo workspace</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <CreateWorkspaceWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </>
  );
}