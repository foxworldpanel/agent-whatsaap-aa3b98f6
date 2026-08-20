# Plan: Instagram Session Manager Implementation (Functional)

Implement a real, functional Instagram account connection system using Playwright for manual login and session persistence.

## User Review Required

> [!IMPORTANT]
> This task involves browser-based automation via Playwright. On Lovable, browser sessions triggered from the server will open in the environment where the server runs.

- **Question**: Do you want the login to happen via a local Playwright browser (which might be hard to interact with visually in the sandbox) or should we focus on the session management logic first?
- **Clarification**: I will implement the session manager to persist state to the database and use Playwright's `storageState` for authentication.

## Proposed Changes

### Database & Types
- Define types for session management (Connecting, Connected, Expired, etc.).
- Ensure `lead_finder_credentials` table supports the required metadata (username, status, storage_state_path).

### Core Services (`src/lib/instagram-session/`)
- `types.ts`: Define interfaces for sessions and status.
- `session-storage.service.ts`: Handle saving/loading Playwright `storageState` files.
- `session-validator.service.ts`: Check if a saved session is still valid (e.g., by navigating to a profile).
- `playwright-session.service.ts`: The bridge to Playwright. Launches the browser, handles manual login wait, and extracts user info after success.
- `instagram-session-manager.ts`: The main orchestrator class providing `connect`, `disconnect`, `reconnect`, etc.

### API & Frontend Integration
- Create server functions for the Session Manager methods to be called from the UI.
- Update `src/routes/_authenticated/lead-finder.tsx` to call these real services instead of mocks.
- Implement real-time status updates in the "Accounts" tab.

### Logging
- Integrate with `Timeline` and `Logs` to record every session state change.

## Technical Details

- **Playwright Usage**: `browser.newContext({ storageState: 'path/to/state.json' })`.
- **Detection**: We will poll the page URL or look for specific selectors (like the search bar or profile icon) to detect a successful login.
- **Persistence**: Storage states will be stored in a dedicated directory and their paths saved in the DB.

## Constraints & Considerations
- No scraping in this phase.
- No permanent password storage.
- Strict adherence to the provided functional requirements (manual login flow).
