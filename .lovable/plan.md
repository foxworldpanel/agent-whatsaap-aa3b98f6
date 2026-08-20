# Lead Finder Sprint 2.1: UX & Instagram Account Manager

Transformar o Lead Finder em uma ferramenta operacional profissional com gerenciamento de contas, fluxo de descoberta em etapas, CRM de leads e monitoramento em tempo real.

## 1. Database & Schema
- Garantir/Criar a tabela `lead_finder_credentials` para gerenciar contas de redes sociais.
- Ajustar `lead_finder_leads` para suportar campos de CRM (lead score, status, metadados ricos).
- Implementar RLS e GRANTs para todas as novas tabelas (`authenticated` access).

## 2. Instagram Account Manager (Backend & UI)
- Implementar `CredentialService` para CRUD de contas.
- Criar a aba "Instagram Accounts" com listagem e status (Conectada, Expirada, etc.).
- Modal "+ Conectar Conta" (Mock/UI flow inicial).

## 3. Discovery UX Evolution
- Refatorar a aba "Discovery" para um fluxo de 4 passos:
  1. **Fonte**: Seleção de plataforma (Instagram ativo, outros "Em breve").
  2. **Conta**: Seleção da credencial cadastrada.
  3. **Tipo**: Perfil (ativo), Hashtag/Keyword ("Em breve").
  4. **Parâmetros**: Username + Limite (10, 25, 50, 100).

## 4. Real-time Discovery Progress
- Criar visualização de "Job em Execução".
- Integrar com `JobService` para exibir progresso (Leads encontrados, perfis analisados, tempo decorrido).

## 5. Lead CRM (Bank & Detail)
- Implementar a tabela de leads com colunas: Foto, Nome, Instagram, Tipo, Telefone, Email, Score, Status, Ações.
- Filtros e busca instantânea no lado do cliente.
- Sheet lateral para detalhes do Lead: Bio, Website, Timeline, Tags, Observações.
- Botão "Enviar para Sales Agent" (Log de evento apenas).

## 6. Timeline & Jobs UI
- Melhorar visual da Timeline (estilo log de eventos temporal).
- Lista de Jobs com estatísticas (tempo, leads, duplicados, erros).

## Technical Details
- **Tables**: `lead_finder_credentials`, `lead_finder_leads`, `lead_finder_jobs`, `lead_finder_tags`, `lead_finder_timeline`.
- **Components**: Shadcn UI (Tabs, Sheet, Table, Card, Badge, Modal).
- **Icons**: Lucide React.
- **Rules**: Stateless Providers, Persistence via LeadService only.
