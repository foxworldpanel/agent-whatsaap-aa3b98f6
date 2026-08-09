import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

const checkFunctions = createServerFn({ method: "GET" })
  .handler(async ({ context }) => {
    if (!context) throw new Error("Context is missing");
    const supabase = context.supabase as any;
    
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
        !isLoading && "Nenhuma função encontrada."
      )}

      {`

sql

SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('get_schema_audit', 'get_missing_tables');`}
    </div>
  );
}
