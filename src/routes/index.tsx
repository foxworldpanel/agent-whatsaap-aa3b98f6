import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redireciona para o dashboard/conversas que é o comportamento original do app real
    navigate({ to: "/conversas", replace: true });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-slate-900 mx-auto mb-4"></div>
        <p className="text-slate-600 font-medium">Carregando ZapAgent...</p>
      </div>
    </div>
  );
}
