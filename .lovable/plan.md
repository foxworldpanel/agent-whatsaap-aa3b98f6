# Plan - Lead Intelligence (Lead Finder) Phase 1

This plan outlines the implementation of the **Lead Intelligence** module (Phase 1, publicly known as **Lead Finder**). The architecture is designed as a universal "Intelligence" layer that discovers, classifies, scores, and feeds leads into the Sales Agent and CRM systems.

## Technical Details

### 1. Advanced Database Schema
A scalable foundation to support future re-processing and multi-platform tracking.

- **`public.lead_sales_status`** (Enum): `NEW`, `QUEUED`, `CONTACTED`, `RESPONDED`, `QUALIFIED`, `CONVERTED`, `LOST`.
- **`lead_finder_leads`**:
  - Identifiers: `id` (UUID, PK), `platform`, `profile_username`, `profile_url`, `display_name`.
  - Content: `bio`, `phone`, `email`, `website`, `links` (JSONB), `raw_profile_data` (JSONB - *Crucial for future re-processing*).
  - Origin: `lead_origin` (e.g., 'Hashtag', 'Profile', 'CSV'), `lead_origin_value` (e.g., '#housemusic', '@djxpto').
  - AI & Scoring: `customer_type`, `segment`, `priority`, `confidence`, `lead_score`, `lead_score_reason`, `ai_version`.
  - Status: `sales_status` (lead_sales_status), `last_seen_at`.
  - Metadata: `created_at`, `updated_at`.
- **`lead_finder_jobs`**:
  - `id`, `origin`, `search_term`, `status`, `config` (JSONB), `stats` (JSONB), `started_at`, `finished_at`, `duration_ms`, `created_by`.
- **`lead_finder_events`**:
  - Tracks lifecycle: `lead_created` -> `ai_analyzed` -> `sent_to_sales` -> `contact_started`.

### 2. Modular Architecture (Lead Intelligence Layer)
Organized under `src/lib/lead-intelligence/` (internal naming):

- **Providers (`/providers/`)**: `BaseProvider`, `MockProvider` (implemented), and placeholders for `InstagramProvider`, `TikTokProvider`, `CSVProvider`.
- **AI Layer (`/ai/`)**: Separate modules for `classify-lead.ts`, `lead-score.ts`, `lead-summary.ts`. Initial versions return mock data.
- **Service Layer**: `LeadIntelligenceService` and `SalesAgentService` to decouple the flow from UI actions.

### 3. UI Implementation
- **Tabs**: Discovery, Lead Bank, Lead Detail (Sheet), Jobs.
- **Components**: shadcn/ui components (Tabs, Table, Sheet, Badge, etc.).
- **Mock Flow**: The "Start Discovery" button triggers the `MockProvider` via `LeadIntelligenceService`.

## Proposed Changes

### Database
- SQL migration for all new tables, enums, and RLS policies.

### Frontend & Logic
- Update `AppShell.tsx` navigation (Icon: `UserPlus` or `Radar`).
- Create `src/routes/_authenticated/lead-finder.tsx`.
- Implement `src/lib/lead-intelligence/` structure and core services.
