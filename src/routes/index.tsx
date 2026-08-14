import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <div className="flex min-h-screen flex-col items-center justify-center p-8 font-mono text-sm">
      <div className="w-full max-w-2xl rounded-lg border bg-card p-6 shadow-sm">
        <pre className="whitespace-pre-wrap break-all text-foreground">
{`ALTER TABLE conversations_v3

ADD COLUMN IF NOT EXISTS order_context jsonb;

SELECT column_name, data_type

FROM information_schema.columns

WHERE table_name = 'conversations_v3'

  AND column_name = 'order_context';`}
        </pre>
      </div>
    </div>
  ),
});
