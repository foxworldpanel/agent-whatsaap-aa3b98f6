# Plan: Fix Instagram Session Manager (BUG P0)

The goal is to ensure the "Connect Account" flow works end-to-end, providing real-time feedback and properly handling different environments (headed vs. headless).

## Proposed Changes

### 1. Instagram Session Manager (`src/lib/instagram-session/`)

- **`playwright-session.service.server.ts`**:
    - Robust browser launch logic (auto-detecting `DISPLAY`).
    - Explicitly handling `headless: true` for validation and `headless: false` for login when a display is present.
    - Improved `extractProfile` logic with better selectors.
- **`instagram-session-manager.server.ts`**:
    - Enhanced error handling to ensure all failures are reported to the UI.
    - Added granular logging for each step of the connection process.
- **`instagram-session.functions.ts`**:
    - Wrap handlers in consistent error-catching logic.

### 2. UI Integration (`src/routes/_authenticated/lead-finder.tsx`)

- **Loading States**: Add `isConnecting` state to provide visual feedback.
- **Granular Toasts**: Use toasts to show the current stage of connection (e.g., "Opening browser...", "Waiting for login...").
- **Automatic Refresh**: Ensure the credential list reloads immediately upon successful connection.

### 3. Server-side Protection

- Ensure all Playwright/Node imports are strictly isolated to `.server.ts` files or dynamic imports inside server functions.

## Technical Details

- **Environment**: The system will automatically use `headless: true` in the Lovable sandbox (where `DISPLAY` is absent) to avoid crashes, while recommending a headed environment for manual user login.
- **Storage**: Sessions are persisted as JSON files in `/tmp/instagram-sessions/` and tracked in the `lead_finder_credentials` table.
- **Validation**: A background check using `headless: true` to verify if the session is still valid.
