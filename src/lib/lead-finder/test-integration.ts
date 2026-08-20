import { discoveryEngine } from "./discovery-engine";
import { MockDiscoveryProvider } from "./providers/mock-provider";
import { InstagramPublicProvider } from "./providers/instagram-public";
import { JobService } from "./job.service";
import { LeadService } from "./lead.service";
import { supabase } from "@/integrations/supabase/client";

/**
 * Lead Finder Integration Test (Phase 1 & 2)
 * Validates the entire flow: Job -> Provider -> Result -> Normalization -> Persistence -> Timeline.
 */
export async function runLeadFinderIntegrationTest() {
  console.log("🚀 Starting Lead Finder Integration Test...");

  const results = [];

  // Test both providers
  const testCases = [
    { type: 'mock', key: 'mock_tester', query: { limit: 2 } },
    { type: 'instagram_public', key: 'instagram_tester', query: { type: 'profile', username: 'lovable_ai' } }
  ];

  for (const test of testCases) {
    console.log(`\n--- Testing Provider: ${test.type} ---`);
    try {
      // 1. Ensure provider exists in DB
      const { data: providerEntry } = await supabase
        .from('lead_finder_providers')
        .upsert({
          provider_type: test.type,
          provider_key: test.key,
          status: 'enabled'
        }, { onConflict: 'provider_key' })
        .select()
        .single();

      if (!providerEntry) throw new Error(`Failed to ensure provider ${test.type} in DB`);

      // 2. Create Job
      const job = await JobService.createJob(providerEntry.id, { test: true, provider: test.type });
      console.log(`✅ Job created for ${test.type}:`, job.id);

      // 3. Start Run
      const run = await JobService.startRun(job.id, test.key);
      console.log(`✅ Run started for ${test.key}:`, run.id);

      // 4. Execution (Stateless Discovery)
      const provider = discoveryEngine.getProvider(test.type === 'mock' ? 'mock' : 'instagram_public');
      if (!provider) throw new Error(`Provider ${test.type} not found in engine`);
      
      const rawResults = await provider.search(test.query);
      console.log(`✅ Found ${rawResults.length} raw results from ${test.type}`);

      // 5. Processing & Persistence (Via LeadService)
      for (const raw of rawResults) {
        // Normalization
        const normalized = discoveryEngine.normalize(raw);
        
        // Save (Intelligent Deduplication inside)
        const lead = await LeadService.saveLead(normalized, `test_${test.type}`, job.id);
        console.log(`✅ Lead persisted: ${lead.profile_username} (${lead.id})`);
        
        await LeadService.addTags(lead.id, ['test-sprint-2', test.type]);
      }

      // 6. Complete Job
      await JobService.finishRun(run.id);
      console.log(`✅ Job and Run for ${test.type} finished successfully!`);
      results.push({ provider: test.type, success: true });

    } catch (error) {
      console.error(`❌ Integration Test failed for ${test.type}:`, error);
      results.push({ provider: test.type, success: false, error: (error as Error).message });
    }
  }

  return results;
}

// Keep backward compatibility if anything else imports it
export const runPhase1IntegrationTest = runLeadFinderIntegrationTest;
