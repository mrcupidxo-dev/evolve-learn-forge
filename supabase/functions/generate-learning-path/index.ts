import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, fileContents, difficulty } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      throw new Error('User not authenticated');
    }

    const systemPrompt = `Generate a structured learning path with topics and subtopics. Return ONLY valid JSON (no markdown) with: title, description, topics (array of {title, subtopics: string[]}), totalLessons.`;
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Create a ${difficulty} level learning path for: ${prompt}. Files: ${fileContents.join('\n')}` }
        ],
      }),
    });

    const data = await response.json();
    let content = data.choices[0].message.content;
    
    // Strip markdown code blocks if present
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const parsed = JSON.parse(content);

    const { data: path } = await supabase.from('learning_paths').insert({
      user_id: user.id,
      title: parsed.title,
      description: parsed.description,
      difficulty,
      total_lessons: parsed.totalLessons,
      topics: parsed.topics,
    }).select().single();

    // Generate first 3 lessons with unique content for each
    for (let i = 0; i < Math.min(3, parsed.totalLessons); i++) {
      const topicIndex = i % parsed.topics.length;
      const topic = parsed.topics[topicIndex];
      const subtopicIndex = Math.floor(i / parsed.topics.length) % topic.subtopics.length;
      const subtopic = topic.subtopics[subtopicIndex];
      
      const lessonResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{ 
            role: 'user', 
            content: `Create lesson ${i+1} specifically about "${subtopic}" within the topic "${topic.title}". This is lesson ${i+1} of a progressive learning path on "${parsed.title}". Make the content unique and focused on this specific subtopic. Return JSON with: explanations (10 items with title, content - each explaining different aspects of ${subtopic}), quizzes (10 items with question, options array, correctAnswer - testing knowledge of ${subtopic}).` 
          }],
        }),
      });
      
      const lessonData = await lessonResponse.json();
      let lessonContent = lessonData.choices[0].message.content;
      
      // Strip markdown code blocks if present
      lessonContent = lessonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      const lesson = JSON.parse(lessonContent);
      
      await supabase.from('lessons').insert({
        learning_path_id: path.id,
        lesson_number: i + 1,
        title: `${topic.title}: ${subtopic}`,
        topic: subtopic,
        explanations: lesson.explanations,
        quizzes: lesson.quizzes,
      });
    }

    return new Response(JSON.stringify({ pathId: path.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
