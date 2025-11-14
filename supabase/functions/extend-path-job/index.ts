import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Rate limiting check for path extension
 */
async function checkRateLimit(supabase: any, userId: string): Promise<{ allowed: boolean; error?: string }> {
  const now = new Date();
  
  const { data: rateLimits, error } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('user_id', userId)
    .eq('action_type', 'extend_path')
    .gte('window_end', now.toISOString())
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Rate limit check error:', error);
    return { allowed: true };
  }

  if (!rateLimits) {
    await supabase.from('rate_limits').insert({
      user_id: userId,
      action_type: 'extend_path',
      count: 1,
      window_start: now.toISOString(),
      window_end: new Date(now.getTime() + 3600000).toISOString(),
    });
    return { allowed: true };
  }

  // Max 10 extensions per hour
  const MAX_EXTENSIONS_PER_HOUR = 10;
  if (rateLimits.count >= MAX_EXTENSIONS_PER_HOUR) {
    const resetTime = new Date(rateLimits.window_end);
    const minutesRemaining = Math.ceil((resetTime.getTime() - now.getTime()) / 60000);
    return {
      allowed: false,
      error: `Rate limit exceeded. You can extend paths ${MAX_EXTENSIONS_PER_HOUR} times per hour. Try again in ${minutesRemaining} minutes.`
    };
  }

  await supabase
    .from('rate_limits')
    .update({ count: rateLimits.count + 1 })
    .eq('id', rateLimits.id);

  return { allowed: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse input
    const { pathId } = await req.json();
    if (!pathId) {
      return new Response(JSON.stringify({ error: 'pathId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user owns this path
    const { data: path, error: pathError } = await supabase
      .from('learning_paths')
      .select('*')
      .eq('id', pathId)
      .eq('user_id', user.id)
      .single();

    if (pathError || !path) {
      return new Response(JSON.stringify({ error: 'Learning path not found or access denied' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if path is already at max lessons
    const { data: existingLessons } = await supabase
      .from('lessons')
      .select('lesson_number')
      .eq('learning_path_id', pathId)
      .order('lesson_number', { ascending: false })
      .limit(1);

    const currentLessonCount = existingLessons?.[0]?.lesson_number || 0;
    if (currentLessonCount >= path.total_lessons) {
      return new Response(JSON.stringify({
        error: 'Learning path is already complete',
        currentLessons: currentLessonCount,
        totalLessons: path.total_lessons,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for pending or processing extension jobs for this path
    const { data: pendingJobs } = await supabase
      .from('jobs')
      .select('*')
      .eq('user_id', user.id)
      .eq('job_type', 'extend_path')
      .in('status', ['pending', 'processing'])
      .eq('input_data->>pathId', pathId);

    if (pendingJobs && pendingJobs.length > 0) {
      return new Response(JSON.stringify({
        error: 'Extension already in progress for this path',
        jobId: pendingJobs[0].id,
      }), {
        status: 409, // Conflict
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check rate limit
    const rateLimitCheck = await checkRateLimit(supabase, user.id);
    if (!rateLimitCheck.allowed) {
      return new Response(JSON.stringify({ error: rateLimitCheck.error }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create job
    const idempotencyKey = `extend_path_${pathId}_${Date.now()}`;
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        user_id: user.id,
        job_type: 'extend_path',
        status: 'pending',
        input_data: { pathId },
        idempotency_key: idempotencyKey,
        metadata: {
          created_from: 'extend-path-job',
          current_lesson_count: currentLessonCount,
          total_lessons: path.total_lessons,
        }
      })
      .select()
      .single();

    if (jobError) {
      console.error('Error creating job:', jobError);
      return new Response(JSON.stringify({ error: 'Failed to create job' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Extension job created: ${job.id} for path ${pathId}`);

    return new Response(JSON.stringify({
      success: true,
      jobId: job.id,
      message: 'Extension in progress. New lessons will be available soon.',
    }), {
      status: 202,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
