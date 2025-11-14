import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schema (manual validation since Zod not available in Deno)
interface CreatePathInput {
  prompt: string;
  fileContents?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}

function validateInput(input: any): { valid: boolean; error?: string; data?: CreatePathInput } {
  // Required fields
  if (!input.prompt || typeof input.prompt !== 'string') {
    return { valid: false, error: 'prompt is required and must be a string' };
  }
  if (input.prompt.length < 10) {
    return { valid: false, error: 'prompt must be at least 10 characters' };
  }
  if (input.prompt.length > 1000) {
    return { valid: false, error: 'prompt must be less than 1000 characters' };
  }

  if (!input.difficulty || !['beginner', 'intermediate', 'advanced'].includes(input.difficulty)) {
    return { valid: false, error: 'difficulty must be beginner, intermediate, or advanced' };
  }

  // Optional file validation
  if (input.fileContents) {
    if (typeof input.fileContents !== 'string') {
      return { valid: false, error: 'fileContents must be a string' };
    }
    if (input.fileContents.length > 5000000) { // 5MB text limit
      return { valid: false, error: 'fileContents too large (max 5MB)' };
    }
  }

  return {
    valid: true,
    data: {
      prompt: input.prompt.trim(),
      fileContents: input.fileContents,
      difficulty: input.difficulty,
      fileName: input.fileName,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
    }
  };
}

/**
 * Rate limiting check
 * Returns true if user is within rate limits
 */
async function checkRateLimit(supabase: any, userId: string): Promise<{ allowed: boolean; error?: string }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 3600000); // 1 hour window
  
  // Check existing rate limits
  const { data: rateLimits, error } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('user_id', userId)
    .eq('action_type', 'create_path')
    .gte('window_end', now.toISOString())
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('Rate limit check error:', error);
    return { allowed: true }; // Fail open to not block users on DB errors
  }

  // If no existing rate limit, allow and create one
  if (!rateLimits) {
    await supabase.from('rate_limits').insert({
      user_id: userId,
      action_type: 'create_path',
      count: 1,
      window_start: now.toISOString(),
      window_end: new Date(now.getTime() + 3600000).toISOString(), // 1 hour from now
    });
    return { allowed: true };
  }

  // Check if rate limit exceeded (max 5 paths per hour)
  const MAX_PATHS_PER_HOUR = 5;
  if (rateLimits.count >= MAX_PATHS_PER_HOUR) {
    const resetTime = new Date(rateLimits.window_end);
    const minutesRemaining = Math.ceil((resetTime.getTime() - now.getTime()) / 60000);
    return {
      allowed: false,
      error: `Rate limit exceeded. You can create ${MAX_PATHS_PER_HOUR} learning paths per hour. Try again in ${minutesRemaining} minutes.`
    };
  }

  // Increment count
  await supabase
    .from('rate_limits')
    .update({ count: rateLimits.count + 1 })
    .eq('id', rateLimits.id);

  return { allowed: true };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authenticated user
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

    // Parse and validate input
    const input = await req.json();
    const validation = validateInput(input);
    
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
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

    // Generate idempotency key from input
    const idempotencyKey = `create_path_${user.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Create job in database
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        user_id: user.id,
        job_type: 'generate_path',
        status: 'pending',
        input_data: validation.data,
        idempotency_key: idempotencyKey,
        metadata: {
          created_from: 'create-path-job',
          user_agent: req.headers.get('user-agent'),
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

    console.log(`Job created: ${job.id} for user ${user.id}`);

    // Return job ID immediately
    return new Response(JSON.stringify({
      success: true,
      jobId: job.id,
      message: 'Your learning path is being generated. This may take 30-60 seconds.',
    }), {
      status: 202, // 202 Accepted
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
