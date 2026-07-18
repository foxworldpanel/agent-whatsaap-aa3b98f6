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
        DIAGNÓSTICO DE RUNTIME — Agente IA:

        Confirmado: o valor no banco é uma string pura, e o normalizador que você escreveu já deveria processar isso corretamente (typeof value === "string" → copia direto). Então por que a tela continua mostrando vazio?

        Preciso que investigue de forma DIFERENTE agora — não mais o dado, mas o comportamento real em tempo de execução:

        1) Confirma: essa correção do normalizador foi PUBLICADA de verdade? Qual o timestamp exato da última publicação?
        2) Adiciona um console.log temporário logo depois do normalizedModules ser montado (dentro do useEffect), mostrando: Object.keys(normalizedModules).length e o conteúdo de normalizedModules["identidade"] especificamente
        3) Acessa você mesmo a tela Agente IA, abre o console do navegador, e cola aqui o que aparece nesse log
        4) Se o log mostrar que normalizedModules ESTÁ correto (com o texto da identidade preenchido), então o bug não é no normalizador — é em outro lugar da tela, entre o estado `modules` e o componente que exibe o texto (ex: a textarea pode estar lendo de uma variável errada, tipo activeModule sem estar sincronizado com modules[activeModule]). Nesse caso, investiga a parte do JSX que renderiza o conteúdo do módulo selecionado.

        Remove o log temporário depois de identificar a causa.

        NÃO aceita mais "resolvido" sem me mostrar a tela funcionando de verdade com print ou confirmação clara do que você viu.
      </div>
    );




  },
});



