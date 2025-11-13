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

    for (let i = 0; i < 3 && nextLessonNum + i <= path!.total_lessons; i++) {
      const topicIndex = Math.floor((nextLessonNum + i - 1) / 3) % path!.topics.length;
      const topic = path!.topics[topicIndex];
      
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{ role: 'user', content: `Create lesson on ${topic.title}. Return JSON with: explanations (10 items), quizzes (10 items).` }],
        }),
      });
      
      const data = await response.json();
      let lessonContent = data.choices[0].message.content;
      
      // Strip markdown code blocks if present
      lessonContent = lessonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      const lesson = JSON.parse(lessonContent);
      
      await supabase.from('lessons').insert({
        learning_path_id: pathId,
        lesson_number: nextLessonNum + i,
        title: topic.title,
        topic: topic.subtopics[0],
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
