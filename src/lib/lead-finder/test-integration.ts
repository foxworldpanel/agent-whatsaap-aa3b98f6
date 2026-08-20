import { discoveryEngine } from "./discovery-engine";
import { MockDiscoveryProvider } from "./providers/mock-provider";
import { InstagramPublicProvider } from "./providers/instagram-public";
import { JobService } from "./job.service";
import { LeadService } from "./lead.service";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lead Finder Integration Test (Phase 2)
 * Validates the flow for the new InstagramPublicProvider.
 */
export async function runPhase2IntegrationTest() {
  console.log("🚀 Starting Phase 2 Integration Test (Instagram Public)...");

  try {
    // 1. Initialize Engine & Provider
    const igProvider = new InstagramPublicProvider();
    const providerKey = 'instagram_public';
    // Registry is usually handled in discovery-engine.ts, but we ensure it here for testing
    discoveryEngine.registerProvider(providerKey, igProvider);
    
    // Ensure provider exists in DB
    const { data: providerEntry } = await supabase
      .from('lead_finder_providers')
      .upsert({
        provider_type: 'instagram_public',
        provider_key: providerKey,
        status: 'enabled'
      }, { onConflict: 'provider_key' })
      .select()
      .single();

    if (!providerEntry) throw new Error("Failed to ensure provider in DB");

    // 2. Create Job for a specific username
    const testUsername = 'lovable_test_lead';
    const job = await JobService.createJob(providerEntry.id, { 
      type: 'profile', 
      username: testUsername 
    });
    console.log("✅ Job created:", job.id);

    // 3. Start Run
    const run = await JobService.startRun(job.id, providerKey);
    console.log("✅ Run started:", run.id);

    // 4. Execution (Stateless Discovery) - Testing search/collect simulation
    const rawResults = await igProvider.search({ 
      type: 'profile', 
      username: testUsername 
    });
    console.log(`✅ Found ${rawResults.length} results for ${testUsername}`);

    if (rawResults.length === 0) throw new Error("No results returned from Instagram provider");

    // 5. Processing & Persistence (Via LeadService)
    for (const raw of rawResults) {
      // Normalization
      const normalized = discoveryEngine.normalize(raw);
      
      // Save (Intelligent Deduplication inside)
      const lead = await LeadService.saveLead(normalized, providerKey, job.id);
      console.log(`✅ Instagram Lead persisted: ${lead.profile_username} (${lead.id})`);
      
      // Add Phase 2 tag
      await LeadService.addTags(lead.id, ['test-phase-2', 'instagram-public']);
    }

    // 6. Complete Job
    await JobService.finishRun(run.id);
    console.log("✅ Phase 2 Job and Run finished successfully!");

    return { success: true, jobId: job.id };
  } catch (error) {
    console.error("❌ Phase 2 Integration Test failed:", error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Legacy Phase 1 Test runner (kept for regression)
 */
export async function runPhase1IntegrationTest() {
  console.log("🚀 Starting Phase 1 Integration Test (Regression)...");
  try {
    const mockProvider = new MockDiscoveryProvider();
    const providerKey = 'mock_tester';
    discoveryEngine.registerProvider(providerKey, mockProvider);
    
    const { data: providerEntry } = await supabase
      .from('lead_finder_providers')
      .upsert({
        provider_type: 'mock',
        provider_key: providerKey,
        status: 'enabled'
      }, { onConflict: 'provider_key' })
      .select()
      .single();

    if (!providerEntry) throw new Error("Failed to ensure provider in DB");

    const job = await JobService.createJob(providerEntry.id, { test: true });
    const run = await JobService.startRun(job.id, providerKey);
    const rawResults = await mockProvider.search({ limit: 2 });

    for (const raw of rawResults) {
      const normalized = discoveryEngine.normalize(raw);
      const lead = await LeadService.saveLead(normalized, 'mock_test', job.id);
      await LeadService.addTags(lead.id, ['test-phase-1-regression']);
    }

    await JobService.finishRun(run.id);
    console.log("✅ Phase 1 Regression Test finished successfully!");
    return { success: true, jobId: job.id };
  } catch (error) {
    console.error("❌ Phase 1 Regression Test failed:", error);
    return { success: false, error: (error as Error).message };
  }
}
