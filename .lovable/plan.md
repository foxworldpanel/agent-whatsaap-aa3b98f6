# Plan - Lead Finder Phase 1

This plan outlines the implementation of the **Lead Finder** module (Phase 1). The goal is to deliver a small, testable, and evolvable module focused on lead discovery and persistence, with a robust architecture prepared for future expansion.

## Phase 1 Success Criteria

Phase 1 is considered complete only if all of the following are true:
- The Lead Finder page is fully functional.
- A mock provider can generate `LeadDiscoveryResult` objects.
- Leads are persisted correctly.
- Intelligent deduplication works.
- Timeline entries are created.
- Jobs and Provider Runs are tracked.
- The module works with AI completely disabled.
- No provider performs database writes directly.
- The architecture allows adding a new provider without changing `DiscoveryEngine`.

## Implementation Strategy

The implementation will be divided into 4 clear stages for easier review:

### Stage 1 - Database
- Enums, Tables, RLS, Indices, and SQL Migrations.

### Stage 2 - Backend & Services
- `IDiscoveryProvider`, `LeadDiscoveryResult`, `DiscoveryEngine`.
- `lead.service.ts`, `job.service.ts`, and a mock `ai.service.ts`.

### Stage 3 - Frontend UI
- Sidebar Menu, Main Page, Tabs, Components.
- Jobs and Timeline views.

### Stage 4 - Mock Provider & Integration
- Mock Discovery implementation.
- End-to-end testing of persistence, timeline, and job tracking.

## Technical Details

### 1. Robust & Scalable Database Schema
- **Enums**: `lead_sales_status`, `lead_pipeline_stage`, `job_status`.
- **`lead_finder_leads`**: Core storage with `platform`, `profile_username`, `discovered_at`, `raw_profile_data`, etc.
- **`lead_finder_tags`**: Dedicated table for flexible filtering.
- **`lead_finder_credentials`**: Multi-account support for Instagram, TikTok, etc.
- **`lead_finder_providers`**: Registry for implementations (e.g., `instagram_public`).
- **`lead_finder_jobs` & `lead_finder_provider_runs`**: Execution tracking and error logging.
- **`lead_finder_timeline`**: Audit trail for leads.

### 2. Modular Architecture (`src/lib/lead-finder/`)
- **`IDiscoveryProvider`**: Interface (`search`, `collect`, `validate`, `stop`).
- **`LeadDiscoveryResult`**: Standardized object (`profile`, `contacts`, `links`, `metadata`, `rawData`).
- **`DiscoveryEngine`**: Orchestrates provider execution and normalization.

### 3. Architectural Principles (The "Provider Contract")
- **Stateless Providers**: Every provider must be stateless. They receive input and return a `LeadDiscoveryResult`.
- **Isolation**: Providers NEVER persist data, call Sales Agent, call AI, or update Lead status. They only discover information.
- **Centralized Persistence**: Only `LeadService` handles database writes, deduplication, and state updates.
- **AI Independence**: Core flow must work without AI. AI is an optional post-persistence step.

## Proposed Changes

### Database
- SQL migration for enums, tables, RLS, and GRANTs.

### Frontend & Services
- Update `AppShell.tsx` navigation.
- Create `src/routes/_authenticated/lead-finder.tsx`.
- Implement `src/lib/lead-finder/` modular structure.
