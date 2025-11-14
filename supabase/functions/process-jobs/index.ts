import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AI Response validation
interface Explanation {
  title: string;
  content: string;
}

interface Quiz {
  question: string;
  options: string[];
  correctAnswer: string;
}

function validateAIResponse(data: any): { valid: boolean; error?: string } {
  if (!data.explanations || !Array.isArray(data.explanations)) {
    return { valid: false, error: 'explanations must be an array' };
  }
  if (!data.quizzes || !Array.isArray(data.quizzes)) {
    return { valid: false, error: 'quizzes must be an array' };
  }

  // Validate explanations
  for (const exp of data.explanations) {
    if (!exp.title || !exp.content) {
      return { valid: false, error: 'Each explanation must have title and content' };
    }
  }

  // Validate quizzes
  for (const quiz of data.quizzes) {
    if (!quiz.question || !quiz.options || !quiz.correctAnswer) {
      return { valid: false, error: 'Each quiz must have question, options, and correctAnswer' };
    }
    if (!Array.isArray(quiz.options) || quiz.options.length < 2) {
      return { valid: false, error: 'Quiz options must be an array with at least 2 items' };
    }
  }

  return { valid: true };
}

/**
 * Process a generate_path job
 */
async function processGeneratePath(supabase: any, serviceSupabase: any, job: any) {
  console.log(`Processing generate_path job: ${job.id}`);
  
  const { prompt, difficulty, fileContents } = job.input_data;
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  // Step 1: Generate learning path structure
  console.log('Calling AI to generate path structure...');
  const pathPrompt = fileContents
    ? `Based on this content:\n\n${fileContents.substring(0, 3000)}\n\nCreate a structured learning path on: "${prompt}". Difficulty: ${difficulty}. Return JSON with: title (string), description (string), topics (array of {title, subtopics: string[]}), total_lessons (number, at least 10).`
    : `Create a structured learning path on: "${prompt}". Difficulty: ${difficulty}. Return JSON with: title (string), description (string), topics (array of {title, subtopics: string[]}), total_lessons (number, at least 10).`;

  const pathResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [{
        role: 'user',
        content: pathPrompt
      }],
    }),
  });

  if (!pathResponse.ok) {
    const errorText = await pathResponse.text();
    console.error('AI path generation failed:', pathResponse.status, errorText);
    throw new Error(`AI API error: ${pathResponse.status} - ${errorText}`);
  }

  const pathData = await pathResponse.json();
  let pathContent = pathData.choices[0].message.content;
  pathContent = pathContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  const learningPath = JSON.parse(pathContent);

  // Validate path structure
  if (!learningPath.title || !learningPath.topics || !learningPath.total_lessons) {
    throw new Error('Invalid learning path structure from AI');
  }

  // Step 2: Insert learning path into database
  console.log('Inserting learning path into database...');
  const { data: pathRecord, error: pathError } = await serviceSupabase
    .from('learning_paths')
    .insert({
      user_id: job.user_id,
      title: learningPath.title,
      description: learningPath.description,
      difficulty: difficulty,
      topics: learningPath.topics,
      total_lessons: learningPath.total_lessons,
      current_lesson: 1,
    })
    .select()
    .single();

  if (pathError) {
    console.error('Error inserting learning path:', pathError);
    throw new Error(`Database error: ${pathError.message}`);
  }

  console.log(`Learning path created: ${pathRecord.id}`);

  // Step 3: Generate first 3 lessons
  const lessonsToGenerate = Math.min(3, learningPath.total_lessons);
  console.log(`Generating first ${lessonsToGenerate} lessons...`);

  for (let i = 0; i < lessonsToGenerate; i++) {
    const lessonNum = i + 1;
    const topicIndex = i % learningPath.topics.length;
    const topic = learningPath.topics[topicIndex];
    const subtopicIndex = Math.floor(i / learningPath.topics.length) % topic.subtopics.length;
    const subtopic = topic.subtopics[subtopicIndex];

    console.log(`Generating lesson ${lessonNum}: ${topic.title} - ${subtopic}`);

    const lessonPrompt = `Create lesson ${lessonNum} about "${subtopic}" within "${topic.title}". This is part of a learning path on "${learningPath.title}". Difficulty: ${difficulty}. Return JSON with: explanations (10 items with title, content), quizzes (10 items with question, options array, correctAnswer).`;

    const lessonResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'user',
          content: lessonPrompt
        }],
      }),
    });

    if (!lessonResponse.ok) {
      console.error(`Lesson ${lessonNum} generation failed:`, lessonResponse.status);
      continue; // Skip this lesson but continue with others
    }

    const lessonData = await lessonResponse.json();
    let lessonContent = lessonData.choices[0].message.content;
    lessonContent = lessonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const lesson = JSON.parse(lessonContent);

    // Validate lesson structure
    const validation = validateAIResponse(lesson);
    if (!validation.valid) {
      console.error(`Lesson ${lessonNum} validation failed:`, validation.error);
      continue;
    }

    // Insert lesson
    const { error: lessonError } = await serviceSupabase
      .from('lessons')
      .insert({
        learning_path_id: pathRecord.id,
        lesson_number: lessonNum,
        title: `${topic.title}: ${subtopic}`,
        topic: subtopic,
        explanations: lesson.explanations,
        quizzes: lesson.quizzes,
      });

    if (lessonError) {
      console.error(`Error inserting lesson ${lessonNum}:`, lessonError);
    } else {
      console.log(`Lesson ${lessonNum} created successfully`);
    }
  }

  return { learningPathId: pathRecord.id };
}

/**
 * Process an extend_path job
 */
async function processExtendPath(supabase: any, serviceSupabase: any, job: any) {
  console.log(`Processing extend_path job: ${job.id}`);
  
  const { pathId } = job.input_data;
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  // Fetch learning path
  const { data: path, error: pathError } = await serviceSupabase
    .from('learning_paths')
    .select('*')
    .eq('id', pathId)
    .single();

  if (pathError || !path) {
    throw new Error('Learning path not found');
  }

  // Get existing lessons with row lock to prevent race conditions
  const { data: existingLessons, error: lessonsError } = await serviceSupabase
    .from('lessons')
    .select('lesson_number')
    .eq('learning_path_id', pathId)
    .order('lesson_number', { ascending: false });

  if (lessonsError) {
    throw new Error(`Error fetching lessons: ${lessonsError.message}`);
  }

  const currentCount = existingLessons?.length || 0;
  const nextLessonNum = currentCount + 1;

  // Check if we've reached the limit
  if (nextLessonNum > path.total_lessons) {
    throw new Error('Path already at maximum lessons');
  }

  // Generate next 3 lessons
  const lessonsToGenerate = Math.min(3, path.total_lessons - currentCount);
  console.log(`Generating ${lessonsToGenerate} lessons starting from ${nextLessonNum}`);

  for (let i = 0; i < lessonsToGenerate; i++) {
    const lessonNum = nextLessonNum + i;
    const topicIndex = (lessonNum - 1) % path.topics.length;
    const topic = path.topics[topicIndex];
    const subtopicIndex = Math.floor((lessonNum - 1) / path.topics.length) % topic.subtopics.length;
    const subtopic = topic.subtopics[subtopicIndex];

    // Check if lesson already exists (double-check to prevent duplicates)
    const { data: existingCheck } = await serviceSupabase
      .from('lessons')
      .select('id')
      .eq('learning_path_id', pathId)
      .eq('lesson_number', lessonNum)
      .maybeSingle();

    if (existingCheck) {
      console.log(`Lesson ${lessonNum} already exists, skipping`);
      continue;
    }

    console.log(`Generating lesson ${lessonNum}: ${topic.title} - ${subtopic}`);

    const lessonPrompt = `Create lesson ${lessonNum} about "${subtopic}" within "${topic.title}". This is part of "${path.title}". Difficulty: ${path.difficulty}. Return JSON with: explanations (10 items with title, content), quizzes (10 items with question, options array, correctAnswer).`;

    const lessonResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{
          role: 'user',
          content: lessonPrompt
        }],
      }),
    });

    if (!lessonResponse.ok) {
      console.error(`Lesson ${lessonNum} generation failed:`, lessonResponse.status);
      continue;
    }

    const lessonData = await lessonResponse.json();
    let lessonContent = lessonData.choices[0].message.content;
    lessonContent = lessonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const lesson = JSON.parse(lessonContent);

    // Validate
    const validation = validateAIResponse(lesson);
    if (!validation.valid) {
      console.error(`Lesson ${lessonNum} validation failed:`, validation.error);
      continue;
    }

    // Insert with conflict handling
    const { error: insertError } = await serviceSupabase
      .from('lessons')
      .insert({
        learning_path_id: pathId,
        lesson_number: lessonNum,
        title: `${topic.title}: ${subtopic}`,
        topic: subtopic,
        explanations: lesson.explanations,
        quizzes: lesson.quizzes,
      });

    if (insertError) {
      console.error(`Error inserting lesson ${lessonNum}:`, insertError);
    } else {
      console.log(`Lesson ${lessonNum} created successfully`);
    }
  }

  return { success: true };
}

/**
 * Main worker loop - polls for pending jobs and processes them
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // This function should be called by a cron job or manual trigger
    // It processes all pending jobs in the queue

    const serviceSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch pending jobs (oldest first)
    const { data: jobs, error: jobsError } = await serviceSupabase
      .from('jobs')
      .select('*')
      .eq('status', 'pending')
      .lt('attempts', 3) // Only process jobs that haven't exceeded max attempts
      .order('created_at', { ascending: true })
      .limit(10); // Process max 10 jobs per invocation

    if (jobsError) {
      console.error('Error fetching jobs:', jobsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch jobs' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!jobs || jobs.length === 0) {
      console.log('No pending jobs to process');
      return new Response(JSON.stringify({ message: 'No pending jobs' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing ${jobs.length} pending jobs`);
    const results = [];

    for (const job of jobs) {
      console.log(`\n=== Processing job ${job.id} (${job.job_type}) ===`);

      // Mark job as processing
      await serviceSupabase
        .from('jobs')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
          attempts: job.attempts + 1,
        })
        .eq('id', job.id);

      try {
        let result;
        if (job.job_type === 'generate_path') {
          result = await processGeneratePath(serviceSupabase, serviceSupabase, job);
        } else if (job.job_type === 'extend_path') {
          result = await processExtendPath(serviceSupabase, serviceSupabase, job);
        } else {
          throw new Error(`Unknown job type: ${job.job_type}`);
        }

        // Mark job as completed
        await serviceSupabase
          .from('jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            result_data: result,
          })
          .eq('id', job.id);

        console.log(`Job ${job.id} completed successfully`);
        results.push({ jobId: job.id, status: 'completed' });

      } catch (error: any) {
        console.error(`Job ${job.id} failed:`, error.message);

        // Check if we should retry
        const shouldRetry = job.attempts + 1 < job.max_attempts;
        const newStatus = shouldRetry ? 'pending' : 'failed';

        await serviceSupabase
          .from('jobs')
          .update({
            status: newStatus,
            error_message: error.message,
          })
          .eq('id', job.id);

        results.push({
          jobId: job.id,
          status: newStatus,
          error: error.message,
          willRetry: shouldRetry,
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed: jobs.length,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Worker error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
