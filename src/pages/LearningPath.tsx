import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Flame, Loader2, MessageSquare, X } from "lucide-react";
import LearningPathMap from "@/components/LearningPathMap";
import ChatSidebar from "@/components/ChatSidebar";
import StreakDisplay from "@/components/StreakDisplay";

const LearningPath = () => {
  const { pathId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState<any>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [progress, setProgress] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    loadPathData();
    loadProfile();
  }, [pathId]);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    setProfile(data);
  };

  const loadPathData = async () => {
    try {
      // Load learning path
      const { data: pathData, error: pathError } = await supabase
        .from("learning_paths")
        .select("*")
        .eq("id", pathId)
        .single();

      if (pathError) throw pathError;
      setPath(pathData);

      // Load lessons
      const { data: lessonsData, error: lessonsError } = await supabase
        .from("lessons")
        .select("*")
        .eq("learning_path_id", pathId)
        .order("lesson_number");

      if (lessonsError) throw lessonsError;
      setLessons(lessonsData || []);

      // Load progress
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: progressData } = await supabase
          .from("lesson_progress")
          .select("*")
          .eq("learning_path_id", pathId)
          .eq("user_id", user.id);

        setProgress(progressData || []);
      }
    } catch (error: any) {
      toast({
        title: "Error loading path",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExtendPath = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("extend-learning-path", {
        body: { pathId },
      });

      if (error) throw error;

      toast({
        title: "Path extended!",
        description: "New lessons have been added",
      });

      loadPathData();
    } catch (error: any) {
      toast({
        title: "Failed to extend path",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-primary/5 to-accent/5">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!path) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-primary/5 to-accent/5">
        <Card className="p-8 text-center">
          <p className="text-lg text-muted-foreground">Learning path not found</p>
          <Button onClick={() => navigate("/")} className="mt-4">
            Go Home
          </Button>
        </Card>
      </div>
    );
  }

  const showExtendButton = progress.length >= 3 && lessons.length <= path.total_lessons;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/5 p-6">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8 space-y-6">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold">{path.title}</h1>
            <p className="text-muted-foreground">{path.description}</p>
            <div className="flex items-center gap-4 text-sm">
              <span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-medium capitalize">
                {path.difficulty}
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Trophy className="w-4 h-4" />
                {profile?.total_stars || 0} total stars
              </span>
              <span className="text-muted-foreground">
                {lessons.length} / {path.total_lessons} lessons
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <StreakDisplay
              currentStreak={profile?.current_streak || 0}
              longestStreak={profile?.longest_streak || 0}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setChatOpen(!chatOpen)}
              className="relative"
            >
              <MessageSquare className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {showExtendButton && (
          <Card className="p-4 bg-gradient-secondary/10 border-secondary">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Ready for more?</h3>
                <p className="text-sm text-muted-foreground">
                  You've completed enough lessons. Extend your learning path!
                </p>
              </div>
              <Button onClick={handleExtendPath} disabled={loading} className="bg-gradient-secondary">
                Extend Path
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Learning Path Map */}
      <div className="max-w-6xl mx-auto">
        <LearningPathMap
          lessons={lessons}
          progress={progress}
          pathId={pathId!}
        />
      </div>

      {/* Chat Sidebar */}
      <ChatSidebar
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        pathId={pathId!}
        currentLesson={lessons[path.current_lesson - 1]}
      />
    </div>
  );
};

export default LearningPath;
