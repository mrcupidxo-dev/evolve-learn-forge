import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import LearningPathMap from "@/components/LearningPathMap";
import Header from "@/components/Header";
import { Badge } from "@/components/ui/badge";

const LearningPath = () => {
  const { pathId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState<any>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [progress, setProgress] = useState<any[]>([]);

  useEffect(() => {
    loadPathData();
  }, [pathId]);

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
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/5">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        {/* Path Info */}
        <div className="mb-8">
          <div className="flex-1">
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-2">
              {path.title}
            </h1>
            <p className="text-muted-foreground">{path.description}</p>
          </div>
          
          <div className="flex items-center gap-4 mt-4">
            <Badge variant="secondary" className="text-sm capitalize">
              {path.difficulty}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {lessons.length} / {path.total_lessons} lessons
            </span>
          </div>
        </div>

        {showExtendButton && (
          <Card className="p-4 mb-8 bg-gradient-to-r from-secondary/10 to-accent/10 border-secondary/20">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Ready for more?</h3>
                <p className="text-sm text-muted-foreground">
                  You've completed enough lessons. Extend your learning path!
                </p>
              </div>
              <Button onClick={handleExtendPath} disabled={loading} className="bg-gradient-secondary">
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Extending...
                  </>
                ) : (
                  "Extend Path"
                )}
              </Button>
            </div>
          </Card>
        )}

        {/* Learning Path Map */}
        <LearningPathMap
          lessons={lessons}
          progress={progress}
          pathId={pathId!}
        />
      </div>
    </div>
  );
};

export default LearningPath;
