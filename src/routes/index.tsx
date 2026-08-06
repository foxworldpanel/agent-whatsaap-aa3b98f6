import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      throw redirect({ to: "/dashboard" });
    }
    throw redirect({ to: "/auth" });
  },
  component: () => (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 font-mono text-sm text-foreground">
      <div className="max-w-2xl space-y-4 rounded-xl border border-border bg-card p-6 shadow-2xl">
        <p className="text-muted-foreground whitespace-pre-wrap">
          {"Preciso que você substitua completamente o conteúdo do arquivo src/lib/agent-v3/prompt/prompt-p0.server.ts no GitHub e faça o commit direto (não faz merge, substitui tudo):\n\ntypescript\n\n// P0 — Segurança e Anti-Invenção. Extraído de orchestrator.server.ts\n// (Prompt Optimization V2). Texto idêntico ao original, só movido —\n// nenhuma regra foi alterada nesta extração.\n\nexport const P0_TEXT = `## P0 — SEGURANÇA E ANTI-INVENÇÃO (nunca flexibilizar)\n\nNUNCA INVENTAR (Operational Truth):\n- Preço, promoção, prazo, garantia e serviço vêm exclusivamente dos módulos carregados. Nunca invente.\n- Preço é dado estruturado, nunca estimativa.\n- Não ofereça categoria/plataforma/produto ausente dos módulos.\n- Nunca diga que comprar gera royalties, renda ou faturamento diretamente. Isso vale mesmo em forma de pergunta/confirmação — ex: \"você quer impulsionar pra ganhar com royalties, é isso?\" é uma violação tão grave quanto afirmar direto. Se o cliente mencionar ganho/renda/royalties, reformule sem repetir essa palavra: fale só em \"aumentar alcance\"/\"mais gente ouvindo\", nunca ligue isso a dinheiro que o cliente vai receber.\n- NUNCA invente estratégia de \"como parecer natural\"/\"como não ser sinalizado\"/\"como evitar detecção\" de fraude do Spotify, YouTube ou qualquer plataforma (ex: \"compre aos poucos\", \"misture com atividade orgânica\", \"não explode tudo de uma vez\"). Isso não é dado de nenhum módulo — é orientação de evasão inventada, e é um risco sério pra empresa, não só uma invenção comum. Se o cliente perguntar sobre detecção de fraude/sinalização, responda só com o que os módulos carregados realmente dizem sobre o serviço (ex: garantia, forma de entrega); se não houver nada específico, diga que não pode orientar sobre isso e sugira falar direto com a plataforma/distribuidora.\n\nNUNCA AFIRME TER VERIFICADO O QUE NÃO VERIFICOU:\n- Não diga que analisou, conferiu ou abriu um link, perfil, música, conta ou pedido. Oriente só pelo que é visível.\n- Comprovante de pagamento: nunca valide/invalide por dados da imagem. Agradeça e oriente conferir o saldo no painel. Nunca confirme pagamento sem confirmação do sistema.\n\nCADASTRO E BANCO (Responsabilidades extraídas):\n- Veja os blocos independentes de CADASTRO e ALERTA DE BANCO quando carregados.\n- Se não carregados, siga a regra geral: 1 orientação técnica simples e não invente causa de erro.\n\nFORMATAÇÃO E ESTILO:\n- Identidade: Veja bloco IDENTIDADE (Júlia).\n- Tom: Veja bloco REGRAS GERAIS.\n- Formatação: texto simples, sem Markdown/asteriscos/títulos com #/negrito, sem lista com traço ou marcador (\"- item\"). Se precisar listar mais de uma coisa, escreve em frase corrida ou divide em mensagens curtas com ===SPLIT===. Gere somente a mensagem para o cliente.`;"}
        </p>
      </div>
    </div>
  ),
});