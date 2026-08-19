# Plan - Lead Finder Phase 1

This plan outlines the implementation of the **Lead Finder** module (Phase 1). The architecture is designed for scalability and resilience, using a multi-engine discovery pipeline that separates data acquisition, enrichment, and sales delivery.

## Technical Details

### 1. Scalable Database Schema
A robust foundation with multi-account and multi-provider support.

- **`public.lead_sales_status`** (Enum): `NEW`, `QUEUED`, `CONTACTED`, `RESPONDED`, `QUALIFIED`, `CONVERTED`, `LOST`.
- **`public.job_status`** (Enum): `PENDING`, `RUNNING`, `FINISHED`, `FAILED`, `PAUSED`, `CANCELLED`.
- **`lead_finder_leads`**:
  - `id`, `platform`, `profile_username`, `profile_url`, `display_name`, `bio`, `phone`, `email`, `website`, `links` (JSONB).
  - `lead_origin`, `lead_origin_value`.
  - `customer_type`, `segment`, `priority`, `confidence`, `lead_score`, `lead_score_reason`, `ai_version`.
  - `sales_status`, `raw_profile_data` (JSONB), `last_seen_at`, `created_at`, `updated_at`.
- **`lead_finder_providers`**: `id`, `provider_key`, `status`, `config`.
- **`lead_finder_jobs`**: `id`, `provider_id`, `status` (`job_status`), `config`, `stats`, `created_by`.
- **`lead_finder_provider_runs`**: `id`, `job_id`, `provider_key`, `credential_id` (for future multiple accounts), `stats`, `status`.
- **`lead_finder_timeline`**: Audit trail for leads (e.g., '19:10 Created', '19:11 AI Analyzed').

### 2. Lead Finder Pipeline Architecture
Organized under `src/lib/lead-finder/`:
- **Interface**: `IDiscoveryProvider` with `search()`, `collect()`, `validate()`, `stop()`.
- **Discovery Engine**: Orchestrates providers based on job configuration.
- **Services**:
  - `lead.service.ts`: Handles persistence, deduplication, and timeline.
  - `job.service.ts`: Manages the job queue and provider runs.
  - `ai.service.ts`: Optional enrichment and scoring (Mock).
  - `sales.service.ts`: Delivery to the Sales Agent queue.

### 3. UI Implementation
- **Tabs**: Discovery, Lead Bank, Lead Detail (Sheet with Timeline), Jobs.
- **Components**: Modern shadcn/ui components.
- **Navigation**: "Lead Finder" in `AppShell.tsx` (Icon: `Radar`).

## Proposed Changes

### Database
- SQL migration for all enums, tables (including `provider_runs` and `timeline`), and RLS.

### Frontend & Services
- Update `AppShell.tsx` navigation.
- Create `src/routes/_authenticated/lead-finder.tsx`.
- Implement `src/lib/lead-finder/` modular structure and interfaces.
