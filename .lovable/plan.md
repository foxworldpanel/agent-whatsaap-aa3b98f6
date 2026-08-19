# Plan - Lead Intelligence (Lead Finder) Phase 1

This plan outlines the implementation of the **Lead Intelligence** module (Phase 1). The architecture is designed as a modular, queue-based pipeline that is robust and scalable, following the successful patterns used in Agent V3.

## Technical Details

### 1. Robust Database Schema
Create a foundation that supports dynamic provider management and offline AI processing.

- **`public.lead_sales_status`** (Enum): `NEW`, `QUEUED`, `CONTACTED`, `RESPONDED`, `QUALIFIED`, `CONVERTED`, `LOST`.
- **`lead_finder_leads`**:
  - `id`, `platform`, `profile_username`, `profile_url`, `display_name`, `bio`, `phone`, `email`, `website`, `links` (JSONB), `raw_profile_data` (JSONB).
  - `lead_origin`, `lead_origin_value`.
  - `customer_type`, `segment`, `priority`, `confidence`, `lead_score`, `lead_score_reason`, `ai_version`.
  - `sales_status`, `last_seen_at`, `created_at`, `updated_at`.
- **`lead_finder_providers`**:
  - `id`, `provider_key` (e.g., 'instagram'), `status` (enabled/disabled), `config` (JSONB).
- **`lead_finder_jobs`**:
  - `id`, `provider_id`, `search_term`, `status`, `config` (JSONB), `stats` (JSONB), `duration_ms`, `created_by`.
- **`lead_finder_events`**: Audit trail for the lead lifecycle.

### 2. Pipeline Architecture
The system follows a non-blocking queue approach:
`Discovery Engine` -> `Lead Bank (Save)` -> `AI Enrichment (Optional)` -> `Lead Score` -> `Sales Queue` -> `Sales Agent`.

Implementation organized under `src/lib/lead-intelligence/`:
- `discovery-engine.ts`: Decides which provider to use.
- `lead.service.ts`: Lead CRUD and deduplication.
- `job.service.ts`: Search execution management.
- `provider.service.ts`: Provider status and config management.
- `ai.service.ts`: Isolated enrichment and scoring logic.
- `sales.service.ts`: Integration with Sales Agent queue.

### 3. UI Implementation
- **Tabs**: Discovery, Lead Bank, Lead Detail (Sheet), Jobs.
- **Components**: Modern shadcn/ui components.
- **Provider Layer**: The Discovery tab communicates with the `Discovery Engine`.

## Proposed Changes

### Database
- SQL migration for all enums, tables (including `lead_finder_providers`), and RLS.

### Frontend & Services
- Update `AppShell.tsx` navigation (Icon: `Radar`).
- Create `src/routes/_authenticated/lead-finder.tsx`.
- Implement `src/lib/lead-intelligence/` service-based structure.
