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
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  console.log("🚀 Starting Phase 1 Integration Test...");


  try {
    // 1. Initialize Engine & Register Mock Provider
    const mockProvider = new MockDiscoveryProvider();
    const providerKey = 'mock_tester';
    discoveryEngine.registerProvider(providerKey, mockProvider);
    
    // Ensure provider exists in DB using Admin client to bypass RLS for setup
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
    const { data: job, error: jobError } = await supabaseAdmin

      .from('lead_finder_jobs')
      .insert({
        provider_id: providerEntry.id,
        status: 'PENDING',
        config: { test: true }
      })
      .select()
      .single();

    if (jobError) throw jobError;
    console.log("✅ Job created:", job.id);

    // 3. Start Run
    const { data: run, error: runError } = await supabaseAdmin
      .from('lead_finder_provider_runs')
      .insert({
        job_id: job.id,
        provider_key: providerKey,
        status: 'running'
      })
      .select()
      .single();

    if (runError) throw runError;
    console.log("✅ Run started:", run.id);

    // 4. Execution (Stateless Discovery)
    const rawResults = await mockProvider.search({ limit: 2 });
    console.log(`✅ Found ${rawResults.length} raw results`);

    // 5. Processing & Persistence (Direct Admin usage)
    for (const raw of rawResults) {
      const normalized = discoveryEngine.normalize(raw);
      
      const { data: lead, error: leadError } = await supabaseAdmin
        .from('lead_finder_leads')
        .upsert({
          platform: normalized.profile.platform.toLowerCase(),
          profile_username: normalized.profile.username.toLowerCase(),
          profile_url: normalized.profile.url,
          display_name: normalized.profile.displayName,
          bio: normalized.profile.bio,
          website: normalized.profile.website,
          phone: normalized.contacts.phone,
          email: normalized.contacts.email,
          links: normalized.links,
          lead_origin: 'mock_test',
          lead_origin_value: job.id,
          raw_profile_data: normalized.rawData,
          discovered_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        }, { onConflict: 'platform,profile_username' })
        .select()
        .single();

      if (leadError) throw leadError;
      console.log(`✅ Lead persisted: ${lead.profile_username} (${lead.id})`);
      
      await supabaseAdmin.from('lead_finder_tags').insert([
        { lead_id: lead.id, tag: 'test-phase-1' },
        { lead_id: lead.id, tag: 'auto-discovered' }
      ]);
    }

    // 6. Complete Job
    await supabaseAdmin
      .from('lead_finder_provider_runs')
      .update({ status: 'finished', finished_at: new Date().toISOString() })
      .eq('id', run.id);

    await supabaseAdmin
      .from('lead_finder_jobs')
      .update({ status: 'FINISHED', updated_at: new Date().toISOString() })
      .eq('id', job.id);

    console.log("✅ Job and Run finished successfully!");


    return { success: true, jobId: job.id };
  } catch (error) {
    console.error("❌ Phase 1 Integration Test failed:", error);
    return { success: false, error: (error as Error).message };
  }
}
