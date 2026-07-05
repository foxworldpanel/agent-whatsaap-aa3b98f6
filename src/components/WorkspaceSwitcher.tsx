import { Check, ChevronsUpDown } from "lucide-react";
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

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, activeWorkspaceId, switchWorkspace, isLoading } = useWorkspace();

  if (isLoading || !workspaces.length) {
    return (
      <div className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-xs text-muted-foreground">
        <span className="h-4 w-4 animate-pulse rounded-full bg-muted" />
        <span>Carregando workspaces…</span>
      </div>
    );
  }

  return (
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}