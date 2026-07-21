# Atualização V3 — consolidação antes da produção

## Fonte única
- A identidade da V3 vem exclusivamente do módulo `identidade` em `agent_modules_v3`.
- `agent_identity` e o runtime V1 permanecem isolados e não participam do prompt V3.

## Module Selector
- Normalização de acentos e pontuação.
- Prioridade para a mensagem atual e para as últimas mensagens do cliente.
- Mensagens do agente não contaminam a detecção de plataforma/produto.
- Distinção entre dúvida de pagamento e pagamento já realizado.
- Detecção de saudação com pergunta real sem perder a intenção comercial.
- Confiança calculada dinamicamente.
- Limite de módulos por turno e seleção somente entre módulos habilitados.

## CMS e módulos
- Módulo explicitamente desabilitado no banco não reaparece por fallback.
- Fallback técnico limitado aos três módulos essenciais.
- Conteúdo, origem e versão dos módulos são preservados na montagem do prompt.
- Overrides customizados entram antes da seleção e podem ser selecionados corretamente.

## Orquestrador
- Removido fallback de workspace fixo/hardcoded.
- Workspace ausente agora gera erro explícito em vez de misturar clientes.
- Removida duplicação de `extraContext` no prompt.
- Resposta sem bloco de texto da Anthropic gera erro controlado.
- Telemetria inclui contexto, motivos, versões e tokens dos módulos também no caminho de loop.

## Administração
- Preview do prompt usa o mesmo `selectModulesV3` do runtime.
- Removida a identidade antiga do preview e da configuração V3.

## Segurança
- Removido log parcial da chave da Anthropic.

## Validação executada
- `npm run build`: aprovado.
- `npx vitest run tests/agent-v3/module-selector-v3.test.ts`: 4/4 testes aprovados.
- A suíte geral ainda contém testes legados V1/V2 incompatíveis com a decisão de isolar a V3; eles não foram alterados.
