# Plan - Lead Finder Phase 1

This plan outlines the implementation of the **Lead Finder** module (Phase 1). The architecture is designed as a modular, queue-based pipeline that decouples data acquisition from processing and delivery, ensuring long-term scalability and robustness.

## Technical Details

### 1. Advanced Database Schema
A scalable foundation with campaigns, tags, and multi-account support.

- **`public.lead_sales_status`** (Enum): `NEW`, `QUEUED`, `CONTACTED`, `RESPONDED`, `QUALIFIED`, `CONVERTED`, `LOST`.
- **`public.lead_pipeline_stage`** (Enum): `DISCOVERED`, `ENRICHED`, `READY_FOR_SALES`, `IN_CAMPAIGN`, `CONTACTED`, `RESPONDED`, `QUALIFIED`, `CUSTOMER`.
- **`public.job_status`** (Enum): `PENDING`, `RUNNING`, `FINISHED`, `FAILED`, `PAUSED`, `CANCELLED`.
- **`lead_finder_leads`**:
  - Identifiers: `id`, `platform`, `profile_username`, `profile_url`, `display_name`.
  - Content: `bio`, `phone`, `email`, `website`, `links` (JSONB), `raw_profile_data` (JSONB).
  - Origin: `lead_origin` (e.g., 'Hashtag'), `lead_origin_value` (e.g., '#housemusic').
  - AI & Scoring: `customer_type`, `segment`, `priority`, `confidence`, `lead_score`, `lead_score_reason`, `ai_version`.
  - Pipeline: `pipeline_stage` (`lead_pipeline_stage`), `sales_status` (`lead_sales_status`), `last_seen_at`.
  - Tags: `tags` (TEXT[]).
- **`lead_finder_campaigns`**: `id`, `name`, `status`, `config` (JSONB), `created_at`.
- **`lead_finder_providers`**: `id`, `provider_key`, `status`, `config` (JSONB).
- **`lead_finder_jobs`**: `id`, `campaign_id` (FK), `status` (`job_status`), `config`, `stats`.
- **`lead_finder_provider_runs`**: `id`, `job_id`, `provider_key`, `credential_id`, `status`.
- **`lead_finder_timeline`**: Audit trail for leads.

### 2. Decoupled Pipeline Architecture
**Rule**: Providers (e.g., `InstagramProvider`) only return a standardized `LeadDiscoveryResult` and are prohibited from direct database or queue access.

`Discovery Engine` -> `Lead Service (Persistence & Deduplication)` -> `AI Service (Enrichment)` -> `Lead Queue` -> `Sales Agent`.

Implementation organized under `src/lib/lead-finder/`:
- **Interface**: `IDiscoveryProvider` (`search`, `collect`, `validate`, `stop`).
- **Services**:
  - `lead.service.ts`: Handles CRUD, timeline, and tagging.
  - `job.service.ts`: Manages job queue and provider runs.
  - `ai.service.ts`: enrichment and scoring (Mock).
  - `queue.service.ts`: Manages the "Ready for Sales" queue.

### 3. UI Implementation
- **Tabs**: Discovery, Lead Bank, Lead Detail (Sheet with Timeline & Tags), Jobs.
- **Navigation**: "Lead Finder" in `AppShell.tsx` (Icon: `Radar`).

## Proposed Changes

### Database
- SQL migration for all enums, tables (including `campaigns`), and RLS with GRANTs.

### Frontend & Services
- Update `AppShell.tsx` navigation.
- Create `src/routes/_authenticated/lead-finder.tsx`.
- Implement service-based structure in `src/lib/lead-finder/` with strict interface enforcement.
