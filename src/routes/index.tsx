import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="p-8 font-mono text-xs whitespace-pre">
      {`esta com erro Internal server error, sistema ficou off`}
    </div>
  );
}