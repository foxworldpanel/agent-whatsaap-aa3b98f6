import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { withWorkspaceScope } from "@/lib/workspace-scope-middleware";

const checkFunctions = createServerFn({ method: "GET" })
  .middleware([withWorkspaceScope])
  .handler(async ({ context }) => {
    // Note: using explicit schema selection with any to bypass strict type check for routines table
    const supabase = (context as any).supabase;
    
    const { data, error } = await supabase
      .from('routines')
      .select('routine_name, routine_type')
      .eq('routine_schema', 'public')
      .in('routine_name', ['get_schema_audit', 'get_missing_tables'])
      .schema('information_schema');
      
    if (error) throw error;
    return data;
  });

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { data: routines, isLoading, error } = useQuery({
    queryKey: ["routines-check"],
    queryFn: () => checkFunctions(),
  });

  return (
    <div className="p-8 font-mono text-xs whitespace-pre">
      {`Resultado da verificação das funções:

`}
      {isLoading && "Carregando..."}
      {error && `Erro: ${error instanceof Error ? error.message : JSON.stringify(error)}`}
      {routines && routines.length > 0 ? (
        routines.map((r: any) => `- ${r.routine_name} (${r.routine_type})`).join("\n")
      ) : (
        !isLoading && routines && "Nenhuma função encontrada."
      )}
      {!isLoading && !routines && !error && "Aguardando resultado..."}

      {`

sql

SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('get_schema_audit', 'get_missing_tables');`}
    </div>
  );
}
