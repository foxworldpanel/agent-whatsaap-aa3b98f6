# Plan: Lead Finder - Phase 2 (Instagram Public Provider)

Implement the first real provider for the Lead Finder system, focusing on public Instagram data while adhering to the Phase 1 architectural contract.

## Proposed Changes

### 1. Provider Layer
- Implement `InstagramPublicProvider` in `src/lib/lead-finder/providers/instagram-public.ts`.
- Ensure it implements `IDiscoveryProvider` and adheres to the stateless contract (no DB, no AI).
- Logic for parsing public profile metadata (username, bio, links, external contact info).

### 2. Service & Engine Integration
- Register the new provider in `DiscoveryEngine`.
- Update `LeadDiscoveryResult` if necessary to better support Instagram-specific fields (e.g., bio parsing).

### 3. Frontend UI Updates
- **Discovery Tab**: Add a provider selector (Radio Group or Select).
- **Conditional Fields**: Show specific inputs based on the selected provider.
- **Instagram Inputs**: Add a field for Instagram Profile handles (e.g., `@username`).

### 4. Technical Details
- Use `LeadService` for all persistence as per Phase 1 rules.
- Maintain existing `MockProvider` functionality for testing.
- Add validation to ensure valid Instagram handles are provided.

## Success Criteria
- [ ] `InstagramPublicProvider` extracts data correctly from a public URL/handle.
- [ ] Switching between Mock and Instagram providers works seamlessly in the UI.
- [ ] No direct database calls exist within the new provider.
- [ ] Phase 1 integration tests still pass.
