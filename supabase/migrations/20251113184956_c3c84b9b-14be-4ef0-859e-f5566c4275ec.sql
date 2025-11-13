-- Create badges table
CREATE TABLE public.badges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  learning_path_id UUID NOT NULL,
  badge_type TEXT NOT NULL, -- 'milestone_3', 'milestone_6', 'milestone_9', etc.
  name TEXT NOT NULL,
  description TEXT,
  earned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own badges" 
ON public.badges 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own badges" 
ON public.badges 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);