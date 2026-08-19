import { discoveryEngine } from "./discovery-engine";
import { MockDiscoveryProvider } from "./providers/mock-provider";
import { JobService } from "./job.service";
import { LeadService } from "./lead.service";
// No direct supabase import needed for logic that uses services

/**
 * Lead Finder Integration Test (Phase 1)
 * Validates the entire flow: Job -> Provider -> Result -> Normalization -> Persistence -> Timeline.
 */
export async function runPhase1IntegrationTest() {
  console.log("🚀 Starting Phase 1 Integration Test...");

  try {
    // 1. Initialize Engine & Register Mock Provider
    const mockProvider = new MockDiscoveryProvider();
    const providerKey = 'mock_tester';
    discoveryEngine.registerProvider(providerKey, mockProvider);
    
    // Ensure provider exists in DB using Admin client to bypass RLS for setup
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: providerEntry, error: providerError } = await supabaseAdmin
      .from('lead_finder_providers')
      .upsert({
        provider_type: 'mock',
        provider_key: providerKey,
        status: 'enabled'
      }, { onConflict: 'provider_key' })
      .select()
      .single();

    if (providerError) {
      console.error("Provider Error:", providerError);
      throw new Error(`Failed to ensure provider in DB: ${providerError.message} (${providerError.code})`);
    }
    if (!providerEntry) throw new Error("Failed to ensure provider in DB: No data returned");



    // 2. Create Job
    const job = await JobService.createJob(providerEntry.id, { test: true });
    console.log("✅ Job created:", job.id);

    // 3. Start Run
    const run = await JobService.startRun(job.id, providerKey);
    console.log("✅ Run started:", run.id);

    // 4. Execution (Stateless Discovery)
    const rawResults = await mockProvider.search({ limit: 2 });
    console.log(`✅ Found ${rawResults.length} raw results`);

    // 5. Processing & Persistence (Via LeadService)
    for (const raw of rawResults) {
      // Normalization
      const normalized = discoveryEngine.normalize(raw);
      
      // Save (Intelligent Deduplication inside)
      const lead = await LeadService.saveLead(normalized, 'mock_test', job.id);
      console.log(`✅ Lead persisted: ${lead.profile_username} (${lead.id})`);
      
      // Optional enrichment tag
      await LeadService.addTags(lead.id, ['test-phase-1', 'auto-discovered']);
    }

    // 6. Complete Job
    await JobService.finishRun(run.id);
    console.log("✅ Job and Run finished successfully!");

    return { success: true, jobId: job.id };
  } catch (error) {
    console.error("❌ Phase 1 Integration Test failed:", error);
    return { success: false, error: (error as Error).message };
  }
}
