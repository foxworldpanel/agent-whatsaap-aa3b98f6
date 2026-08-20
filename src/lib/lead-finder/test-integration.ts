import { discoveryEngine } from "./discovery-engine";
import { JobService } from "./job.service";
import { LeadService } from "./lead.service";
import { supabase } from "@/integrations/supabase/client";
// InstagramSessionManager is imported dynamically in functions below to avoid client bundling errors

/**
 * Lead Finder Integration Test (Phase 1, 2 & 3)
 * Validates the entire flow: Job -> Provider -> Result -> Normalization -> Persistence -> Timeline.
 * Added Instagram Session validation for Sprint 3.1.
 */
export async function runLeadFinderIntegrationTest() {
  console.log("🚀 Starting Lead Finder Integration Test...");

  const results = [];

  // 1. Test Providers (Stateless)
  const providerTestCases = [
    { type: 'mock', key: 'mock_tester', query: { limit: 2 } },
    { type: 'instagram_public', key: 'instagram_tester', query: { type: 'profile', username: 'lovable_ai' } }
  ];

  for (const test of providerTestCases) {
    console.log(`\n--- Testing Provider: ${test.type} ---`);
    try {
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

      const job = await JobService.createJob(providerEntry.id, { test: true, provider: test.type });
      const run = await JobService.startRun(job.id, test.key);
      const provider = discoveryEngine.getProvider(test.type === 'mock' ? 'mock' : 'instagram_public');
      if (!provider) throw new Error(`Provider ${test.type} not found in engine`);
      
      const rawResults = await provider.search(test.query);
      for (const raw of rawResults) {
        const normalized = discoveryEngine.normalize(raw);
        const lead = await LeadService.saveLead(normalized, `test_${test.type}`, job.id);
        await LeadService.addTags(lead.id, ['test-integration', test.type]);
      }

      await JobService.finishRun(run.id);
      results.push({ provider: test.type, success: true });
    } catch (error) {
      console.error(`❌ Integration Test failed for ${test.type}:`, error);
      results.push({ provider: test.type, success: false, error: (error as Error).message });
    }
  }

  // 2. Test Instagram Session Management (Sprint 3.1)
  console.log(`\n--- Testing Instagram Session Manager ---`);
  try {
    // We can't automate a real login that requires manual interaction here,
    // but we can test the session listing and validation logic with existing data.
    const { InstagramSessionManager } = await import("../instagram-session/instagram-session-manager");
    const sessions = await InstagramSessionManager.listSessions();
    console.log(`✅ Found ${sessions.length} Instagram sessions in DB`);
    
    if (sessions.length > 0) {
      const target = sessions[0];
      console.log(`Testing validation for existing session: @${target.username}`);
      const { InstagramSessionManager } = await import("../instagram-session/instagram-session-manager");
      const status = await InstagramSessionManager.validate(target.id);
      console.log(`✅ Session validation result: ${status}`);
    } else {
      console.log("ℹ️ No Instagram sessions available to test validation.");
    }
    
    results.push({ provider: 'instagram_session_manager', success: true });
  } catch (error) {
    console.error(`❌ Instagram Session Manager test failed:`, error);
    results.push({ provider: 'instagram_session_manager', success: false, error: (error as Error).message });
  }

  return results;
}

export const runPhase1IntegrationTest = runLeadFinderIntegrationTest;
