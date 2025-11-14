import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  job_type: string;
  status: JobStatus;
  input_data: any;
  result_data: any;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

interface UseJobPollingResult {
  job: Job | null;
  isPolling: boolean;
  error: string | null;
  startPolling: (jobId: string) => void;
  stopPolling: () => void;
}

/**
 * Hook to poll for job status updates
 * Automatically stops polling when job is completed or failed
 */
export function useJobPolling(
  onComplete?: (job: Job) => void,
  onError?: (error: string) => void
): UseJobPollingResult {
  const [job, setJob] = useState<Job | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  const stopPolling = useCallback(() => {
    if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }
    setIsPolling(false);
  }, [pollInterval]);

  const fetchJobStatus = useCallback(async (id: string) => {
    try {
      const { data, error: fetchError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) {
        console.error('Error fetching job:', fetchError);
        setError(fetchError.message);
        onError?.(fetchError.message);
        stopPolling();
        return;
      }

      if (data) {
        setJob(data);

        // Stop polling if job is completed or failed
        if (data.status === 'completed') {
          stopPolling();
          onComplete?.(data);
        } else if (data.status === 'failed') {
          stopPolling();
          setError(data.error_message || 'Job failed');
          onError?.(data.error_message || 'Job failed');
        }
      }
    } catch (err: any) {
      console.error('Unexpected error fetching job:', err);
      setError(err.message);
      stopPolling();
    }
  }, [onComplete, onError, stopPolling]);

  const startPolling = useCallback((id: string) => {
    setJobId(id);
    setIsPolling(true);
    setError(null);

    // Immediate first fetch
    fetchJobStatus(id);

    // Poll every 2 seconds
    const interval = setInterval(() => {
      fetchJobStatus(id);
    }, 2000);

    setPollInterval(interval);
  }, [fetchJobStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [pollInterval]);

  return {
    job,
    isPolling,
    error,
    startPolling,
    stopPolling,
  };
}
