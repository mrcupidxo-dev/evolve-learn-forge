import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Sparkles, Zap, Target, LogOut, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [learningPaths, setLearningPaths] = useState<any[]>([]);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user) {
      setUser(session.user);
      loadLearningPaths(session.user.id);
    } else {
      setLoading(false);
    }

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadLearningPaths(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  };

  const loadLearningPaths = async (userId: string) => {
    const { data } = await supabase
      .from("learning_paths")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    setLearningPaths(data || []);
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Logged out",
      description: "See you next time!",
    });
    setUser(null);
    setLearningPaths([]);
  };

  // Not logged in - show landing page
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/5">
        {/* Hero Section */}
        <div className="container mx-auto px-4 py-20">
          <div className="text-center space-y-8 max-w-4xl mx-auto">
            <div className="inline-block bg-gradient-primary p-4 rounded-3xl shadow-glow mb-4">
              <BookOpen className="w-16 h-16 text-white" />
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold leading-tight">
              <span className="bg-gradient-primary bg-clip-text text-transparent">
                Learn Anything
              </span>
              <br />
              <span className="text-foreground">with AI-Powered Lessons</span>
            </h1>

            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
              Transform any topic into a personalized learning path. Interactive lessons, quizzes, and progress tracking—all powered by AI.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
              <Button
                onClick={() => navigate("/signup")}
                size="lg"
                className="bg-gradient-primary hover:opacity-90 text-white font-semibold shadow-lg text-lg px-8"
              >
                <Sparkles className="w-5 h-5 mr-2" />
                Start Learning
              </Button>
              <Button
                onClick={() => navigate("/login")}
                size="lg"
                variant="outline"
                className="font-semibold text-lg px-8"
              >
                Sign In
              </Button>
            </div>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-8 mt-24 max-w-5xl mx-auto">
            <Card className="shadow-md hover:shadow-lg transition-shadow">
              <CardContent className="pt-6 text-center space-y-4">
                <div className="bg-gradient-primary p-3 rounded-2xl w-fit mx-auto">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold">AI-Generated Content</h3>
                <p className="text-muted-foreground">
                  Create dynamic lessons on any topic with our advanced AI. Just describe what you want to learn.
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-md hover:shadow-lg transition-shadow">
              <CardContent className="pt-6 text-center space-y-4">
                <div className="bg-gradient-success p-3 rounded-2xl w-fit mx-auto">
                  <Target className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold">Duolingo-Style Path</h3>
                <p className="text-muted-foreground">
                  Follow an engaging roadmap with circular nodes, unlock new lessons, and track your progress.
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-md hover:shadow-lg transition-shadow">
              <CardContent className="pt-6 text-center space-y-4">
                <div className="bg-gradient-secondary p-3 rounded-2xl w-fit mx-auto">
                  <Zap className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold">Gamified Learning</h3>
                <p className="text-muted-foreground">
                  Earn stars, build streaks, and stay motivated with achievements and daily goals.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Logged in - show dashboard
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/5 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold">My Learning</h1>
            <p className="text-muted-foreground">Continue your journey or start something new</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate("/settings")}
            >
              <Settings className="w-5 h-5" />
            </Button>
            <Button
              variant="outline"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>

        {/* Learning Paths */}
        {learningPaths.length === 0 ? (
          <Card className="p-12 text-center space-y-6">
            <div className="bg-gradient-primary p-4 rounded-3xl w-fit mx-auto">
              <BookOpen className="w-12 h-12 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-2">Start Your First Learning Path</h2>
              <p className="text-muted-foreground">
                Create AI-powered lessons on any topic you want to learn
              </p>
            </div>
            <Button
              onClick={() => navigate("/create-lesson")}
              size="lg"
              className="bg-gradient-primary hover:opacity-90 text-white font-semibold"
            >
              <Sparkles className="w-5 h-5 mr-2" />
              Create Learning Path
            </Button>
          </Card>
        ) : (
          <>
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-semibold">Your Learning Paths</h2>
              <Button
                onClick={() => navigate("/create-lesson")}
                className="bg-gradient-primary"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                New Path
              </Button>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {learningPaths.map((path) => (
                <Card
                  key={path.id}
                  className="cursor-pointer hover:shadow-lg transition-all hover:-translate-y-1"
                  onClick={() => navigate(`/learning-path/${path.id}`)}
                >
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="bg-gradient-primary p-2 rounded-lg">
                        <BookOpen className="w-6 h-6 text-white" />
                      </div>
                      <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium capitalize">
                        {path.difficulty}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg mb-1">{path.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {path.description}
                      </p>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Lesson {path.current_lesson} of {path.total_lessons}
                      </span>
                      <div className="flex items-center gap-1">
                        <Target className="w-4 h-4 text-accent" />
                        <span className="font-medium">
                          {Math.round((path.current_lesson / path.total_lessons) * 100)}%
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
