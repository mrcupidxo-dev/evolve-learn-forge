import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { pathId } = await req.json();
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    
    const { data: path } = await supabase.from('learning_paths').select('*').eq('id', pathId).single();
    const { data: existingLessons } = await supabase.from('lessons').select('*').eq('learning_path_id', pathId);
    
    const nextLessonNum = existingLessons!.length + 1;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    // Check if lessons already exist to prevent duplicates
    const { data: checkLessons } = await supabase
      .from('lessons')
      .select('lesson_number')
      .eq('learning_path_id', pathId)
      .gte('lesson_number', nextLessonNum)
      .lte('lesson_number', nextLessonNum + 2);
    
    if (checkLessons && checkLessons.length > 0) {
      console.log('Lessons already exist, skipping generation');
      return new Response(JSON.stringify({ success: true, message: 'Lessons already exist' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    for (let i = 0; i < 3 && nextLessonNum + i <= path!.total_lessons; i++) {
      const lessonNum = nextLessonNum + i;
      // Use lessonNum - 1 for zero-based indexing
      const topicIndex = (lessonNum - 1) % path!.topics.length;
      const topic = path!.topics[topicIndex];
      const subtopicIndex = Math.floor((lessonNum - 1) / path!.topics.length) % topic.subtopics.length;
      const subtopic = topic.subtopics[subtopicIndex];
      
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{ 
            role: 'user', 
            content: `Create lesson ${lessonNum} specifically about "${subtopic}" within the topic "${topic.title}". This is a continuation of a progressive learning path on "${path!.title}". Make the content unique and focused on this specific subtopic, building upon previous lessons. Return JSON with: explanations (10 items with title, content - each explaining different aspects of ${subtopic}), quizzes (10 items with question, options array, correctAnswer - testing knowledge of ${subtopic}).` 
          }],
        }),
      });
      
      const data = await response.json();
      let lessonContent = data.choices[0].message.content;
      
      // Strip markdown code blocks if present
      lessonContent = lessonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      const lesson = JSON.parse(lessonContent);
      
      await supabase.from('lessons').insert({
        learning_path_id: pathId,
        lesson_number: lessonNum,
        title: `${topic.title}: ${subtopic}`,
        topic: subtopic,
        explanations: lesson.explanations,
        quizzes: lesson.quizzes,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
