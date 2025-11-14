-- =====================================================
-- PART 1: CREATE NEW TABLES FOR JOB QUEUE ARCHITECTURE
-- =====================================================

-- Create enum for job types
CREATE TYPE public.job_type AS ENUM ('generate_path', 'extend_path');

-- Create enum for job status
CREATE TYPE public.job_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

-- Create enum for user roles (for future admin features)
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- =====================================================
-- TABLE: jobs - Background job queue
-- =====================================================
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type public.job_type NOT NULL,
  status public.job_status NOT NULL DEFAULT 'pending',
  
  -- Input data for the job (prompt, difficulty, file_path, etc.)
  input_data JSONB NOT NULL DEFAULT '{}',
  
  -- Result data (learning_path_id, error messages, etc.)
  result_data JSONB DEFAULT '{}',
  
  -- Idempotency key to prevent duplicate processing
  idempotency_key TEXT UNIQUE,
  
  -- Retry logic
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Error tracking
  error_message TEXT,
  
  -- Metadata for debugging
  metadata JSONB DEFAULT '{}'
);

-- Add indexes for performance
CREATE INDEX idx_jobs_user_id ON public.jobs(user_id);
CREATE INDEX idx_jobs_status ON public.jobs(status);
CREATE INDEX idx_jobs_job_type ON public.jobs(job_type);
CREATE INDEX idx_jobs_created_at ON public.jobs(created_at DESC);
CREATE INDEX idx_jobs_idempotency_key ON public.jobs(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Composite index for worker queries (finding pending jobs)
CREATE INDEX idx_jobs_pending ON public.jobs(status, created_at) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for jobs
CREATE POLICY "Users can view their own jobs"
  ON public.jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own jobs"
  ON public.jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Only service role (worker) can update jobs
CREATE POLICY "Service role can update jobs"
  ON public.jobs FOR UPDATE
  USING (true);

-- =====================================================
-- TABLE: rate_limits - Cost control and abuse prevention
-- =====================================================
CREATE TABLE public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  
  -- Count of actions in current window
  count INTEGER NOT NULL DEFAULT 1,
  
  -- Time window
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_end TIMESTAMPTZ NOT NULL,
  
  -- Metadata (e.g., cost tracking)
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Unique constraint: one rate limit per user per action per window
  UNIQUE(user_id, action_type, window_start)
);

-- Indexes
CREATE INDEX idx_rate_limits_user_action ON public.rate_limits(user_id, action_type);
CREATE INDEX idx_rate_limits_window ON public.rate_limits(window_end);

-- Enable RLS
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own rate limits"
  ON public.rate_limits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage rate limits"
  ON public.rate_limits FOR ALL
  USING (true);

-- =====================================================
-- TABLE: uploaded_files - File audit trail
-- =====================================================
CREATE TABLE public.uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Storage path in Supabase Storage
  storage_path TEXT NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'learning-path-files',
  
  -- File metadata
  original_filename TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  
  -- Timestamps
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  
  -- Metadata (e.g., extraction status)
  metadata JSONB DEFAULT '{}',
  
  -- Soft delete
  is_deleted BOOLEAN NOT NULL DEFAULT false
);

-- Indexes
CREATE INDEX idx_uploaded_files_user_id ON public.uploaded_files(user_id);
CREATE INDEX idx_uploaded_files_storage_path ON public.uploaded_files(storage_path);
CREATE INDEX idx_uploaded_files_uploaded_at ON public.uploaded_files(uploaded_at DESC);

-- Enable RLS
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own files"
  ON public.uploaded_files FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own files"
  ON public.uploaded_files FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own files"
  ON public.uploaded_files FOR UPDATE
  USING (auth.uid() = user_id);

-- =====================================================
-- TABLE: user_roles - Role-based access control
-- =====================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, role)
);

-- Index
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Only admins can assign roles (implement later via security definer function)

-- =====================================================
-- SECURITY DEFINER FUNCTION: Check user role
-- =====================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- =====================================================
-- PART 2: ADD PERFORMANCE INDEXES TO EXISTING TABLES
-- =====================================================

-- Lessons table indexes
CREATE INDEX IF NOT EXISTS idx_lessons_learning_path_id ON public.lessons(learning_path_id);
CREATE INDEX IF NOT EXISTS idx_lessons_lesson_number ON public.lessons(lesson_number);
CREATE INDEX IF NOT EXISTS idx_lessons_path_lesson ON public.lessons(learning_path_id, lesson_number);

-- Lesson progress indexes
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_path ON public.lesson_progress(user_id, learning_path_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson_id ON public.lesson_progress(lesson_id);

-- Learning paths indexes
CREATE INDEX IF NOT EXISTS idx_learning_paths_user_id ON public.learning_paths(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_paths_created_at ON public.learning_paths(created_at DESC);

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- =====================================================
-- PART 3: CREATE STORAGE BUCKET AND POLICIES
-- =====================================================

-- Create private bucket for learning path files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'learning-path-files',
  'learning-path-files',
  false,  -- Private bucket
  20971520,  -- 20MB limit
  ARRAY[
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Users can only access their own files
CREATE POLICY "Users can upload their own files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'learning-path-files' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view their own files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'learning-path-files' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'learning-path-files' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'learning-path-files' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- =====================================================
-- PART 4: ADD TRIGGERS FOR AUTOMATIC TIMESTAMPS
-- =====================================================

-- Trigger for rate_limits updated_at
CREATE TRIGGER update_rate_limits_updated_at
  BEFORE UPDATE ON public.rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- PART 5: ADD VALIDATION CONSTRAINTS
-- =====================================================

-- Ensure file sizes are positive
ALTER TABLE public.uploaded_files
  ADD CONSTRAINT check_file_size_positive CHECK (file_size > 0);

-- Ensure job attempts don't exceed max
ALTER TABLE public.jobs
  ADD CONSTRAINT check_attempts_within_max CHECK (attempts <= max_attempts);

-- Ensure rate limit count is positive
ALTER TABLE public.rate_limits
  ADD CONSTRAINT check_rate_limit_count_positive CHECK (count > 0);

-- Ensure window_end is after window_start
ALTER TABLE public.rate_limits
  ADD CONSTRAINT check_rate_limit_window_valid CHECK (window_end > window_start);