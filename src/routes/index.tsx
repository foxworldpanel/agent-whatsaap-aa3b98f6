/* dashboard nao esta abrindo */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: DecommissioningLanding,
});

function DecommissioningLanding() {
  const navigate = useNavigate();

  useEffect(() => {
    // Redireciona para o dashboard principal
    navigate({ to: "/conversas" });
  }, [navigate]);

  return null;
}
