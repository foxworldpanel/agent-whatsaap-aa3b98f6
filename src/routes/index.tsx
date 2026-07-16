import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <h1 className="text-3xl font-bold">ZapAgent - Agente IA</h1>
        <p className="mt-4 text-muted-foreground max-w-lg">
          Configuração do Agente IA concluída:
        </p>
        <div className="mt-6 text-left bg-muted p-4 rounded-lg text-sm font-mono whitespace-pre-wrap max-w-2xl">
{`1. Desativa a consulta automática de serviços via API:
Remove o toggle 'Consultar preços em tempo real' e para de buscar os 213 serviços da API antes de cada mensagem. Isso economiza tokens e evita confusão do agente.

2. Cria card 'Tabela de Preços Manual':
Tabela editável com colunas:
Plataforma (Spotify, YouTube, Instagram, TikTok, etc)
Serviço (Plays, Views, Seguidores, etc)
Público (Brasil, Global, EUA)
Preço por 1000
Mínimo
Máximo
Toggle Ativo/Inativo
Botão '+ Adicionar serviço'
Botão 'Salvar tabela'

3. Instrução para o Claude:
'Esta é a tabela COMPLETA de serviços disponíveis. O que não estiver aqui NÃO existe no painel. Quando cliente perguntar sobre serviço que não está na tabela responde: No momento não temos esse serviço disponível.
NUNCA mencione siglas BQ, MQ, HQ — use apenas os serviços listados na tabela.
NUNCA invente preço — use apenas os valores desta tabela.
NUNCA confirme quantidade abaixo do mínimo listado.'

4. Botão 'Atualizar agente':
Quando você editar a tabela e clicar em salvar, o agente já usa as novas informações imediatamente.
Salva na tabela price_table no banco.`}
        </div>
        <a href="/agente" className="mt-8 px-6 py-2 bg-primary text-primary-foreground rounded-md font-medium">
          Ver Agente IA
        </a>
      </div>
    );
  },
});
