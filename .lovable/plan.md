# Plan: Fix Instagram Session Manager & Build Failure

The build is failing because server-side dependencies (Playwright, Node modules) are leaking into the client-side bundle via the Instagram Session Manager modules. I will strictly isolate these modules and use dynamic imports to ensure they are only loaded in the server environment.

## Tasks

1. **Strict Server-Side Isolation**
   - Rename `instagram-session-manager.server.ts` to `instagram-session-manager.server.ts` (already done, but verify contents).
   - Ensure ALL Node.js/Playwright imports in `.server.ts` files are dynamic and guarded by `typeof window === 'undefined'`.

2. **Fix Build Failure (Rolldown Resolve Error)**
   - The error `Rolldown failed to resolve import "chromium-bidi/lib/cjs/bidiMapper/BidiMapper"` indicates that Vite/Rolldown is trying to bundle Playwright for the client or during SSR analysis.
   - I will mark `playwright` and other Node modules as external in a way that prevents them from being bundled into the client code.

3. **Restructure Instagram Session Manager Modules**
   - Move all logic that touches Playwright into a dedicated `playwright-launcher.server.ts` to centralize the risk.
   - Use `tanstack-start` server-function splitting best practices.

4. **Verify Implementation**
   - Run `bun run build:dev` to ensure the build passes.
   - Use Playwright via shell to verify the Instagram connection flow works in the sandbox environment.

## Technical Details

- **Environment**: TanStack Start (React 19, Vite 8).
- **Issue**: Static analysis of `import('playwright')` is triggering Rolldown to resolve its sub-dependencies.
- **Fix**: Wrap imports in a wrapper that Vite's static analyzer won't follow to the client, or use specific Vite config (if accessible) to externalize them. Since I cannot edit `vite.config.ts` easily without risking breaking other things, I will focus on code-level isolation.
- **Isolation Strategy**:
  ```typescript
  const playwright = await (eval('import("playwright")'));
  ```
  Using `eval` or similar patterns can sometimes bypass overly aggressive static analysis, but standard dynamic imports should work if the file is correctly identified as server-only.
