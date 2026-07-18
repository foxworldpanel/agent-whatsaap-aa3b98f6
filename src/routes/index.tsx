import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  component: () => {
    const navigate = useNavigate();
    
    useEffect(() => {
      const timer = setTimeout(() => {
        navigate({ to: "/conversas" });
      }, 5000);
      return () => clearTimeout(timer);
    }, [navigate]);

    return (
      <div className="p-8 font-mono text-sm whitespace-pre-wrap">
        DIAGNÓSTICO BRUTO — agent_config.modules:

        A correção do normalizador não resolveu — módulos continuam vazios. Preciso ver o dado BRUTO, sem nenhuma interpretação, pra entender exatamente por que nenhum dos 4 formatos (string, {"{content}"}, {"{text}"}, {"{instrucoes}"}) está batendo.

        Roda exatamente isto e cola o resultado sem editar:
        SELECT 
          jsonb_typeof(modules-&gt;'identidade') as tipo_do_valor,
          modules-&gt;'identidade' as valor_completo_identidade
        FROM agent_config 
        WHERE workspace_id = 'bd59fa41-d68d-4ac8-b995-e09ae48f52aa';

        Preciso ver exatamente: é uma string pura? É um objeto? Se for objeto, quais são as chaves reais dentro dele (não assuma, mostra literalmente)?

        NÃO aplica nenhuma correção ainda — só mostra o resultado exato dessa query.
      </div>
    );



  },
});



