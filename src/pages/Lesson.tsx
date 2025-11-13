import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, Star, Trophy, Loader2, ArrowLeft, Award } from "lucide-react";
import { cn } from "@/lib/utils";
import ChatSidebar from "@/components/ChatSidebar";

const Lesson = () => {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [lesson, setLesson] = useState<any>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showResults, setShowResults] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [showBadgeClaim, setShowBadgeClaim] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [earnedStars, setEarnedStars] = useState(0);

  useEffect(() => {
    loadLesson();
  }, [lessonId]);

  const loadLesson = async () => {
    try {
      const { data, error } = await supabase
        .from("lessons")
        .select("*")
        .eq("id", lessonId)
        .single();

      if (error) throw error;
      
      console.log("Loaded lesson:", data);
      console.log("Explanations count:", data?.explanations?.length);
      console.log("Quizzes count:", data?.quizzes?.length);
      
      setLesson(data);
    } catch (error: any) {
      toast({
        title: "Error loading lesson",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    const totalItems = (lesson?.explanations?.length || 0) + (lesson?.quizzes?.length || 0);
    if (currentIndex < totalItems - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    const quizzes = lesson?.quizzes || [];
    let correct = 0;

    quizzes.forEach((quiz: any, i: number) => {
      const explanationCount = lesson?.explanations?.length || 0;
      const answerIndex = answers[explanationCount + i];
      if (answerIndex !== undefined && quiz.options[parseInt(answerIndex)] === quiz.correctAnswer) {
        correct++;
      }
    });

    setCorrectCount(correct);
    const percentage = (correct / quizzes.length) * 100;
    const stars = percentage >= 90 ? 3 : percentage >= 50 ? 2 : 1;
    setEarnedStars(stars);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Save progress
      await supabase.from("lesson_progress").upsert({
        user_id: user.id,
        lesson_id: lessonId,
        learning_path_id: lesson.learning_path_id,
        stars_earned: stars,
        correct_answers: correct,
        total_questions: quizzes.length,
        completed: true,
        completed_at: new Date().toISOString(),
      });

      // Update streak
      const today = new Date().toISOString().split("T")[0];
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profile) {
        const lastActivity = profile.last_activity_date;
        let newStreak = profile.current_streak;

        if (lastActivity !== today) {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split("T")[0];

          if (lastActivity === yesterdayStr) {
            newStreak += 1;
          } else {
            newStreak = 1;
          }

          await supabase
            .from("profiles")
            .update({
              current_streak: newStreak,
              longest_streak: Math.max(newStreak, profile.longest_streak),
              last_activity_date: today,
              total_stars: profile.total_stars + stars,
            })
            .eq("id", user.id);
        }
      }

      // Trigger lesson generation for next batch after every 3 lessons
      if (lesson.lesson_number % 3 === 0) {
        await supabase.functions.invoke("extend-learning-path", {
          body: { pathId: lesson.learning_path_id },
        });
      }

      // Check if this is the LAST lesson in the path
      const { data: pathData } = await supabase
        .from("learning_paths")
        .select("total_lessons")
        .eq("id", lesson.learning_path_id)
        .single();
      
      if (pathData && lesson.lesson_number === pathData.total_lessons) {
        setShowBadgeClaim(true);
      }

      setShowResults(true);
    } catch (error: any) {
      toast({
        title: "Error saving progress",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleClaimBadge = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: pathData } = await supabase
        .from("learning_paths")
        .select("title")
        .eq("id", lesson.learning_path_id)
        .single();

      await supabase.from("badges").insert({
        user_id: user.id,
        learning_path_id: lesson.learning_path_id,
        badge_type: `completion`,
        name: `${pathData?.title} Master!`,
        description: `Completed the entire learning path with ${earnedStars} stars on the final lesson!`,
      });

      toast({
        title: "Badge Claimed!",
        description: "Check your achievements in Settings",
      });

      setShowBadgeClaim(false);
    } catch (error: any) {
      toast({
        title: "Error claiming badge",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <p className="text-lg text-muted-foreground">Lesson not found</p>
        </Card>
      </div>
    );
  }

  const explanations = lesson.explanations || [];
  const quizzes = lesson.quizzes || [];
  const totalItems = explanations.length + quizzes.length;
  const isExplanation = currentIndex < explanations.length;
  const currentContent = isExplanation
    ? explanations[currentIndex]
    : quizzes[currentIndex - explanations.length];

  const progress = ((currentIndex + 1) / totalItems) * 100;

  if (showResults) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-success/5 to-primary/5 p-6">
        <Card className="max-w-2xl w-full p-8 text-center space-y-6">
          <div className="bg-gradient-success w-24 h-24 rounded-full mx-auto flex items-center justify-center shadow-glow">
            <Trophy className="w-12 h-12 text-white" />
          </div>

          <div>
            <h2 className="text-3xl font-bold mb-2">Lesson Complete!</h2>
            <p className="text-muted-foreground">
              You answered {correctCount} out of {quizzes.length} questions correctly
            </p>
          </div>

          <div className="flex justify-center gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Star
                key={i}
                className={cn(
                  "w-12 h-12",
                  i < earnedStars
                    ? "fill-secondary text-secondary"
                    : "text-muted-foreground"
                )}
              />
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-lg font-semibold">
              {earnedStars === 3 && "Perfect! 🎉"}
              {earnedStars === 2 && "Great job! 👏"}
              {earnedStars === 1 && "Good effort! Keep practicing! 💪"}
            </p>
          </div>

          {showBadgeClaim && (
            <Card className="p-6 bg-gradient-primary border-2 border-secondary">
              <Award className="w-12 h-12 mx-auto mb-4 text-white" />
              <h3 className="text-xl font-bold text-white mb-2">
                Milestone Achievement!
              </h3>
              <p className="text-white/90 mb-4">
                You've completed lesson {lesson.lesson_number}! Claim your badge.
              </p>
              <Button
                onClick={handleClaimBadge}
                variant="secondary"
                className="w-full"
              >
                <Award className="w-4 h-4 mr-2" />
                Claim Badge
              </Button>
            </Card>
          )}

          <Button
            onClick={() => navigate(`/learning-path/${lesson.learning_path_id}`)}
            className="bg-gradient-primary"
            size="lg"
          >
            Back to Path
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/5 p-6">
      <Button
        variant="outline"
        onClick={() => setIsChatOpen(!isChatOpen)}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg"
      >
        💬
      </Button>

      <ChatSidebar
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        pathId={lesson?.learning_path_id}
        currentLesson={lesson}
      />

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate(`/learning-path/${lesson.learning_path_id}`)}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Path
          </Button>
          <div className="text-sm text-muted-foreground">
            {currentIndex + 1} / {totalItems}
          </div>
        </div>

        {/* Progress */}
        <Progress value={progress} className="h-2" />

        {/* Content Card */}
        <Card className="p-8 shadow-lg">
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "px-3 py-1 rounded-full text-sm font-medium",
                  isExplanation
                    ? "bg-primary/10 text-primary"
                    : "bg-accent/10 text-accent"
                )}
              >
                {isExplanation ? "Learn" : "Quiz"}
              </span>
              <h2 className="text-2xl font-bold">{lesson.title}</h2>
            </div>

            {isExplanation ? (
              <div className="prose prose-lg max-w-none">
                <h3 className="text-xl font-semibold mb-4">{currentContent.title}</h3>
                <p className="text-foreground/90 leading-relaxed">{currentContent.content}</p>
              </div>
            ) : (
              <div className="space-y-6">
                <h3 className="text-xl font-semibold">{currentContent.question}</h3>
                <RadioGroup
                  value={answers[currentIndex]?.toString() || ""}
                  onValueChange={(value) =>
                    setAnswers({ ...answers, [currentIndex]: value })
                  }
                >
                  <div className="space-y-3">
                    {currentContent.options.map((option: string, i: number) => (
                      <div
                        key={i}
                        className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <RadioGroupItem value={i.toString()} id={`option-${i}`} />
                        <Label
                          htmlFor={`option-${i}`}
                          className="flex-1 cursor-pointer text-base"
                        >
                          {option}
                        </Label>
                      </div>
                    ))}
                  </div>
                </RadioGroup>
              </div>
            )}

            <Button
              onClick={handleNext}
              disabled={!isExplanation && !answers[currentIndex]}
              className="w-full bg-gradient-primary text-white font-semibold"
              size="lg"
            >
              {currentIndex === totalItems - 1 ? "Complete Lesson" : "Next"}
              <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Lesson;
