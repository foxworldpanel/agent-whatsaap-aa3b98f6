import { supabase } from "@/integrations/supabase/client";
import { JobStatus } from "./types";
import { Database } from "@/integrations/supabase/types";

type JobInsert = Database['public']['Tables']['lead_finder_jobs']['Insert'];
type JobUpdate = Database['public']['Tables']['lead_finder_jobs']['Update'];
type RunInsert = Database['public']['Tables']['lead_finder_provider_runs']['Insert'];

/**
 * Job Service
 * Handles lead discovery job lifecycle and execution tracking.
 */
export class JobService {
  /**
   * Creates a new discovery job.
   */
  static async createJob(providerId: string, config: any = {}) {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { data: job, error } = await supabase
      .from('lead_finder_jobs')
      .insert({
        provider_id: providerId,
        status: 'PENDING',
        config: config as any,
        created_by: user?.id,
        stats: { leads: 0, duplicates: 0, profiles_analyzed: 0, errors: 0 } as any
      } as JobInsert)
      .select()
      .single();

    if (error) throw error;
    return job;
  }

  /**
   * Starts a provider run within a job.
   */
  static async startRun(jobId: string, providerKey: string, credentialId?: string) {
    const { data: run, error } = await supabase
      .from('lead_finder_provider_runs')
      .insert({
        job_id: jobId,
        provider_key: providerKey,
        credential_id: credentialId,
        status: 'running'
      } as RunInsert)
      .select()
      .single();

    if (error) throw error;
    
    await this.updateJobStatus(jobId, 'RUNNING');
    
    return run;
  }

  /**
   * Updates job statistics.
   */
  static async updateStats(jobId: string, stats: { leads?: number; duplicates?: number; profiles_analyzed?: number; errors?: number }) {
    const { data: job } = await supabase.from('lead_finder_jobs').select('stats').eq('id', jobId).single();
    if (!job) return;

    const currentStats = (job.stats as any) || { leads: 0, duplicates: 0, profiles_analyzed: 0, errors: 0 };
    const newStats = {
      leads: (currentStats.leads || 0) + (stats.leads || 0),
      duplicates: (currentStats.duplicates || 0) + (stats.duplicates || 0),
      profiles_analyzed: (currentStats.profiles_analyzed || 0) + (stats.profiles_analyzed || 0),
      errors: (currentStats.errors || 0) + (stats.errors || 0),
    };

    await supabase.from('lead_finder_jobs').update({ stats: newStats as any }).eq('id', jobId);
  }

  /**
   * Completes a provider run.
   */
  static async finishRun(runId: string, error?: string) {
    const { data: run, error: fetchError } = await supabase
      .from('lead_finder_provider_runs')
      .update({
        status: error ? 'failed' : 'finished',
        error_message: error,
        finished_at: new Date().toISOString()
      } as any)
      .eq('id', runId)
      .select()
      .single();

    if (fetchError) throw fetchError;
    
    // Check if all runs for this job are finished
    if (run) {
      await this.checkJobCompletion(run.job_id);
    }
    
    return run;
  }

  /**
   * Updates job status.
   */
  static async updateJobStatus(jobId: string, status: JobStatus) {
    const { error } = await supabase
      .from('lead_finder_jobs')
      .update({ status: status as any, updated_at: new Date().toISOString() } as JobUpdate)
      .eq('id', jobId);
    
    if (error) throw error;
  }

  /**
   * Lists recent jobs.
   */
  static async listJobs() {
    const { data, error } = await supabase
      .from('lead_finder_jobs')
      .select('*, lead_finder_provider_runs(*)')
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (error) throw error;
    return data;
  }

  /**
   * Internal helper to check if job is complete.
   */
  private static async checkJobCompletion(jobId: string) {
    const { data: runs, error } = await supabase
      .from('lead_finder_provider_runs')
      .select('status')
      .eq('job_id', jobId);

    if (error) return;

    const allFinished = runs.every(r => r.status === 'finished' || r.status === 'failed');
    if (allFinished) {
      const anyFailed = runs.some(r => r.status === 'failed');
      await this.updateJobStatus(jobId, anyFailed ? 'FAILED' : 'FINISHED');
    }
  }
}
