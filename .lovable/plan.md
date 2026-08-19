# Plan - Lead Finder Phase 1

This plan outlines the implementation of the **Lead Finder** module (Phase 1). The goal is to deliver a small, testable, and evolvable module focused on lead discovery and persistence, with a robust architecture prepared for future expansion.

## Technical Details

### 1. Robust & Scalable Database Schema
A foundation prepared for multi-account and multi-platform discovery.

- **Enums**:
  - `public.lead_sales_status`: `NEW`, `QUEUED`, `CONTACTED`, `RESPONDED`, `QUALIFIED`, `CONVERTED`, `LOST`.
  - `public.lead_pipeline_stage`: `DISCOVERED`, `ENRICHED`, `READY_FOR_SALES`, `IN_CAMPAIGN`, `CONTACTED`, `RESPONDED`, `QUALIFIED`, `CUSTOMER`.
  - `public.job_status`: `PENDING`, `RUNNING`, `FINISHED`, `FAILED`, `PAUSED`, `CANCELLED`.
- **`lead_finder_leads`**:
  - `id` (UUID, PK), `platform`, `profile_username`, `profile_url`, `display_name`, `bio`, `phone`, `email`, `website`, `links` (JSONB).
  - `lead_origin`, `lead_origin_value`.
  - `raw_profile_data` (JSONB) - For future AI re-processing.
  - `customer_type`, `segment`, `priority`, `confidence`, `lead_score`, `lead_score_reason`, `ai_version`.
  - `pipeline_stage` (`lead_pipeline_stage`), `sales_status` (`lead_sales_status`).
  - `discovered_at` (When the lead was first found by a provider).
  - `last_seen_at`, `created_at`, `updated_at`.
- **`lead_finder_tags`**:
  - Dedicated table for tags: `id`, `lead_id` (FK), `tag` (TEXT), `created_at`.
- **`lead_finder_credentials`**:
  - `id`, `provider_type` (e.g., 'instagram'), `account_name`, `status`, `config` (JSONB).
- **`lead_finder_providers`**:
  - `id`, `provider_type`, `provider_key` (e.g., 'instagram_public'), `status` (enabled/disabled), `config` (JSONB).
- **`lead_finder_jobs`**:
  - `id`, `provider_id` (FK), `status` (`job_status`), `config` (JSONB), `stats` (JSONB), `created_by` (UUID).
- **`lead_finder_provider_runs`**:
  - `id`, `job_id` (FK), `provider_key`, `credential_id` (FK to `lead_finder_credentials`), `status`, `error_message`, `finished_at`.
- **`lead_finder_timeline`**: Audit trail for leads (e.g., '19:10 Discovered').

### 2. Modular Architecture (`src/lib/lead-finder/`)
- **`IDiscoveryProvider`**: Interface (`search`, `collect`, `validate`, `stop`).
- **`LeadDiscoveryResult`**: Standardized object returned by all providers (`profile`, `contacts`, `links`, `metadata`, `rawData`).
- **`DiscoveryEngine`**: Orchestrates provider selection, normalization, and execution.
- **Services**:
  - `lead.service.ts`: CRUD, deduplication, and timeline.
  - `job.service.ts`: Queue management and run tracking.
  - `ai.service.ts`: Enrichment and scoring (Mock initially).

### 3. Critical Architectural Rules
- **Database Isolation**: No provider is allowed to perform `INSERT`, `UPDATE`, or `DELETE` directly. They must only return a `LeadDiscoveryResult`.
- **Centralized Persistence**: Only `LeadService` handles persistence, deduplication, timeline registration, and state updates.
- **AI Independence**: AI is optional. The core discovery flow must work even if AI services are unavailable.
  - **Mandatory Flow**: Discovery -> Normalize -> LeadService -> Database.
  - **Optional Flow**: Database -> AI Enrichment -> Lead Score.

### 4. User Interface
- **Tabs**: Discovery (Form + Start), Lead Bank (Universal Table), Lead Detail (Sheet + Timeline), Jobs (Audit).
- **Navigation**: "Lead Finder" in `AppShell.tsx` (Icon: `Radar`).

## Proposed Changes

### Database
- SQL migration for all enums, tables (including `credentials` and `tags`), RLS, and GRANTs.

### Frontend & Services
- Update `AppShell.tsx` navigation.
- Create `src/routes/_authenticated/lead-finder.tsx`.
- Implement `src/lib/lead-finder/` modular structure and interfaces.
