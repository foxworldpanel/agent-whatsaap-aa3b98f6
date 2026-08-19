# Plan - Lead Finder Phase 1

This plan outlines the implementation of the **Lead Finder** module (Phase 1). This phase focuses on the foundational structure: database schema, navigation, and the core user interface with four functional tabs. Automatic lead scraping is not part of this phase.

## Technical Details

### 1. Database Schema
Create two new tables in the `public` schema with RLS and appropriate grants.

- **`lead_finder_leads`**: Stores discovered lead information.
  - `id` (UUID, PK), `instagram`, `name`, `bio`, `phone`, `email`, `website`, `links` (JSONB), `source`, `search_term`, `lead_type`, `segment`, `priority`, `confidence` (numeric), `ai_analysis` (JSONB), `status`, `already_contacted` (boolean), `created_at`, `updated_at`.
- **`lead_finder_jobs`**: Tracks search/discovery tasks.
  - `id` (UUID, PK), `origin`, `search_term`, `status`, `started_at`, `finished_at`, `total_found`, `new_leads`, `duplicates`, `errors`.

### 2. Navigation
- Add a new "Lead Finder" item to `src/components/AppShell.tsx` using a modern icon (e.g., `Search` or `UserPlus`).
- Create the route at `src/routes/_authenticated/lead-finder.tsx`.

### 3. User Interface (Lead Finder Page)
Implement a tabbed interface using Shadcn components:
- **Discovery (Aba 1)**: Form to start searches. Selection for Origin (Instagram, TikTok, etc.), Search Type (Hashtag, Keyword, Profile), Max Leads, and AI Classification toggle. The "Start" button will trigger a mock job for now.
- **Lead Bank (Aba 2)**: A modern data table with columns for lead data, filters (WhatsApp, Email, Contacted status, Priority), search, and pagination.
- **Lead Detail (Aba 3)**: A side panel (Sheet) triggered by clicking a lead, showing full info and "Send to Sales Agent" (event logging) and "Edit/Delete" actions.
- **Jobs (Aba 4)**: A list of search jobs showing status and summary statistics.

### 4. Integration Boilerplate
- Prepare functions in `src/lib/lead-finder.functions.ts` for CRUD operations.
- Set up the interface for future AI analysis storage.

## Proposed Changes

### Database
- Execute SQL migration for `lead_finder_leads` and `lead_finder_jobs`.

### Frontend
- Update `AppShell.tsx` navigation.
- Create `src/routes/_authenticated/lead-finder.tsx`.
- Create supporting components for the tabs.
