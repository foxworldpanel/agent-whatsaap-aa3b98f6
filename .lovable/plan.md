# Plan - Lead Finder Phase 1

This plan outlines the implementation of the **Lead Finder** module (Phase 1). The goal is to deliver a small, testable, and evolvable module focused on lead discovery and persistence. While campaign and messaging structures will be established at the database level to avoid future migrations, the functional flow for this phase is strictly limited to discovery and management.

## Technical Details

### 1. Future-Proof Database Schema
A robust foundation with enums and tables prepared for full pipeline integration.

- **`public.lead_sales_status`** (Enum): `NEW`, `QUEUED`, `CONTACTED`, `RESPONDED`, `QUALIFIED`, `CONVERTED`, `LOST`.
- **`public.lead_pipeline_stage`** (Enum): `DISCOVERED`, `ENRICHED`, `READY_FOR_SALES`, `IN_CAMPAIGN`, `CONTACTED`, `RESPONDED`, `QUALIFIED`, `CUSTOMER`.
- **`public.job_status`** (Enum): `PENDING`, `RUNNING`, `FINISHED`, `FAILED`, `PAUSED`, `CANCELLED`.
- **`lead_finder_leads`**:
  - `id` (UUID, PK), `platform`, `profile_username`, `profile_url`, `display_name`, `bio`, `phone`, `email`, `website`, `links` (JSONB).
  - `lead_origin`, `lead_origin_value`.
  - `raw_profile_data` (JSONB) - For future AI re-processing.
  - `customer_type`, `segment`, `priority`, `confidence`, `lead_score`, `lead_score_reason`, `ai_version`.
  - `pipeline_stage` (`lead_pipeline_stage`), `sales_status` (`lead_sales_status`), `tags` (TEXT[]).
  - `last_seen_at`, `created_at`, `updated_at`.
- **`lead_finder_providers`**: `id`, `provider_key`, `status` (enabled/disabled), `config` (JSONB).
- **`lead_finder_jobs`**: `id`, `provider_id` (FK), `status` (`job_status`), `config` (JSONB), `stats` (JSONB), `created_by` (UUID).
- **`lead_finder_provider_runs`**: `id`, `job_id` (FK), `provider_key`, `credential_id` (for multi-account), `status`.
- **`lead_finder_timeline`**: Audit trail for leads (e.g., '19:10 Discovered').
- **`lead_finder_campaigns`**: `id`, `name`, `status`, `config` (JSONB) - *Structure only for Phase 1*.

### 2. Decoupled Architecture (`src/lib/lead-finder/`)
- **`IDiscoveryProvider`**: Strict interface ensuring providers only return data and don't touch the DB.
- **`DiscoveryEngine`**: Orchestrates providers.
- **Services**:
  - `lead.service.ts`: CRUD, deduplication, and timeline.
  - `job.service.ts`: Queue management and job status.
  - `ai.service.ts`: enrichment and scoring (Mock initially).

### 3. User Interface
- **Tabs**: Discovery (Select Provider & Start Search), Lead Bank (Universal Table), Lead Detail (Sheet with Info & Timeline), Jobs (Audit).
- **Navigation**: "Lead Finder" in `AppShell.tsx` (Icon: `Radar`).

## Proposed Changes

### Database
- SQL migration for all enums, tables, RLS, and GRANTs.

### Frontend & Services
- Update `AppShell.tsx` navigation.
- Create `src/routes/_authenticated/lead-finder.tsx`.
- Implement `src/lib/lead-finder/` modular structure and core services.
