# Plan - Lead Finder Phase 1 (Universal & Scalable)

This plan outlines the implementation of the **Lead Finder** module (Phase 1). The architecture is designed to be universal, platform-agnostic, and prepared for future AI and Sales Agent automation, avoiding future migrations and refactoring.

## Technical Details

### 1. Database Schema
Create a robust, scalable schema in the `public` schema.

- **`public.lead_sales_status`** (Enum):
  - `NEW`, `QUEUED`, `CONTACTED`, `RESPONDED`, `QUALIFIED`, `CONVERTED`, `LOST`.

- **`lead_finder_leads`**:
  - `id` (UUID, PK).
  - `platform` (e.g., 'instagram', 'tiktok', 'manual', 'csv').
  - `profile_username`, `profile_url`, `display_name`, `bio`, `phone`, `email`, `website`, `links` (JSONB).
  - `source` (e.g., search term, CSV file name).
  - `customer_type`, `segment`, `priority`, `confidence` (numeric).
  - `lead_score` (numeric), `lead_score_reason` (text).
  - `sales_status` (Enum `lead_sales_status` default 'NEW').
  - `ai_analysis` (JSONB) - For additional unstructured metadata.
  - `created_at`, `updated_at`.
  - *Deduplication*: Prepared for intelligent deduplication based on `platform` + `profile_username`, `phone`, and `email`.

- **`lead_finder_jobs`**:
  - `id` (UUID, PK), `origin` (platform/provider), `search_term`, `status`.
  - `config` (JSONB) - For provider-specific settings.
  - `stats` (JSONB) - For rich execution statistics.
  - `started_at`, `finished_at`, `duration_ms`, `created_by` (UUID).

- **`lead_finder_events`**:
  - `id` (UUID, PK), `lead_id` (FK), `event_type` (e.g., 'lead_created', 'ai_analyzed', 'sent_to_sales', 'contact_started', 'response_received').
  - `metadata` (JSONB), `created_at`.

### 2. Navigation
- Add "Lead Finder" to `src/components/AppShell.tsx` using a modern icon (e.g., `UserPlus` or `Radar`).
- Route: `src/routes/_authenticated/lead-finder.tsx`.

### 3. User Interface (Lead Finder Page)
- **Discovery (Aba 1)**: Generic "Discovery Provider" interface. Platform selection (Instagram, TikTok, YouTube, Manual, CSV), Search Type, Max Quantity, AI Toggle. "Start" button triggers a Mock Provider for now.
- **Lead Bank (Aba 2)**: Universal data table with platform-agnostic columns. Filters by platform, status, score, etc.
- **Lead Detail (Aba 3)**: Sheet showing profile info, individual AI classification fields, score, and event history.
- **Jobs (Aba 4)**: Audit list of all discovery executions with stats.

### 4. Integration Boilerplate
- `src/lib/lead-finder/`: Modular structure for discovery providers (starting with `mock.ts`).
- `src/lib/lead-finder.functions.ts` for CRUD and backend communication.

## Proposed Changes

### Database
- SQL migration for enums, tables, and RLS policies with GRANTs.

### Frontend
- Update `AppShell.tsx` navigation.
- Create `src/routes/_authenticated/lead-finder.tsx`.
- Implement supporting components for tabs and providers.
