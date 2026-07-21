import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { 
  LayoutDashboard, 
  MessageSquare, 
  Bot, 
  ShieldCheck, 
  Settings,
  ChevronRight,
  Menu,
  X,
  Zap
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  component: AdminLayout,
});

function AdminLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const navItems = [
    { label: "Dashboard", icon: LayoutDashboard, to: "/" },
    { label: "Conversas", icon: MessageSquare, to: "/conversations" },
    { label: "Agente IA", icon: Bot, to: "/_authenticated/admin/agent-playground" },
    { label: "Auditoria IA", icon: ShieldCheck, to: "/auditoria" },
    { label: "Configurações", icon: Settings, to: "/settings" },
  ];

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar toggle for mobile */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 lg:hidden text-white"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? <X /> : <Menu />}
      </Button>

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-card border-r border-white/5 transition-transform duration-300 lg:static lg:translate-x-0",
          !isSidebarOpen && "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-white/5">
            <h2 className="text-xl font-bold text-white tracking-tighter flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-500" />
              Mind Admin
            </h2>
          </div>
          
          <ScrollArea className="flex-1 py-4">
            <nav className="px-3 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-white hover:bg-white/5 transition-all group"
                  activeProps={{ className: "bg-white/10 text-white font-semibold" }}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                  <ChevronRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-40 transition-opacity" />
                </Link>
              ))}
            </nav>
          </ScrollArea>

          <div className="p-4 border-t border-white/5">
            <div className="bg-white/5 rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider mb-1">Status do Sistema</p>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-xs text-white">V3 Runtime Operacional</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-background">
        <Outlet />
      </main>
    </div>
  );
}
