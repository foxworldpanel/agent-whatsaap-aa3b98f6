import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="p-8 font-mono text-xs whitespace-pre">
      {`Seria bom reenviar a query certa pra ele rodar:

sql

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'conversations_v3'
  AND column_name = 'order_context';`}
    </div>
  );
}