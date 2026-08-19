import { supabase } from "@/integrations/supabase/client";
import { JobStatus } from "./types";

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
        config,
        created_by: user?.id
      })
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
      })
      .select()
      .single();

    if (error) throw error;
    
    await this.updateJobStatus(jobId, 'RUNNING');
    
    return run;
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
      })
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
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', jobId);
    
    if (error) throw error;
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
