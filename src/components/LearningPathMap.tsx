import { useNavigate } from "react-router-dom";
import { CheckCircle2, Lock, PlayCircle, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface LearningPathMapProps {
  lessons: any[];
  progress: any[];
  pathId: string;
}

const LearningPathMap = ({ lessons, progress, pathId }: LearningPathMapProps) => {
  const navigate = useNavigate();

  const getLessonStatus = (lessonId: string, lessonNumber: number) => {
    // First lesson is always available
    if (lessonNumber === 1) {
      const lessonProgress = progress.find((p) => p.lesson_id === lessonId);
      if (lessonProgress?.completed) return "completed";
      return "available";
    }
    
    const lessonProgress = progress.find((p) => p.lesson_id === lessonId);
    if (!lessonProgress) return "locked";
    if (lessonProgress.completed) return "completed";
    return "available";
  };

  const getLessonStars = (lessonId: string) => {
    const lessonProgress = progress.find((p) => p.lesson_id === lessonId);
    return lessonProgress?.stars_earned || 0;
  };

  const handleLessonClick = (lesson: any, status: string) => {
    if (status === "locked") return;
    navigate(`/lesson/${lesson.id}`);
  };

  return (
    <div className="relative py-12">
      {/* Path line */}
      <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-gradient-to-b from-primary via-accent to-secondary opacity-20 -translate-x-1/2" />

      {/* Lessons */}
      <div className="space-y-16">
        {lessons.map((lesson, index) => {
          const status = getLessonStatus(lesson.id, lesson.lesson_number);
          const stars = getLessonStars(lesson.id);
          const isLeft = index % 2 === 0;

          return (
            <div
              key={lesson.id}
              className={cn(
                "relative flex items-center",
                isLeft ? "justify-start" : "justify-end"
              )}
            >
              {/* Lesson Node */}
              <div
                className={cn(
                  "w-1/2 flex",
                  isLeft ? "justify-end pr-12" : "justify-start pl-12"
                )}
              >
                <div
                  onClick={() => handleLessonClick(lesson, status)}
                  className={cn(
                    "group relative transition-all duration-300 cursor-pointer",
                    status === "locked" && "cursor-not-allowed opacity-50"
                  )}
                >
                  {/* Connector to center line */}
                  <div
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 h-0.5 w-12 bg-gradient-to-r",
                      isLeft ? "left-full" : "right-full",
                      status === "completed" && "from-success to-primary",
                      status === "available" && "from-primary to-accent",
                      status === "locked" && "from-muted to-muted"
                    )}
                  />

                  {/* Node Circle */}
                  <div className="relative">
                    <div
                      className={cn(
                        "w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all duration-300",
                        "group-hover:scale-110 group-hover:shadow-glow",
                        status === "completed" && "bg-gradient-success",
                        status === "available" && "bg-gradient-primary",
                        status === "locked" && "bg-muted"
                      )}
                    >
                      {status === "completed" && (
                        <CheckCircle2 className="w-10 h-10 text-white" />
                      )}
                      {status === "available" && (
                        <PlayCircle className="w-10 h-10 text-white" />
                      )}
                      {status === "locked" && (
                        <Lock className="w-10 h-10 text-muted-foreground" />
                      )}
                    </div>

                    {/* Stars */}
                    {stars > 0 && (
                      <div className="absolute -top-2 -right-2 flex gap-0.5">
                        {Array.from({ length: stars }).map((_, i) => (
                          <Star
                            key={i}
                            className="w-4 h-4 fill-secondary text-secondary"
                          />
                        ))}
                      </div>
                    )}

                    {/* Lesson Number */}
                    <div
                      className={cn(
                        "absolute -top-3 -left-3 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-md",
                        status === "completed" && "bg-success text-white",
                        status === "available" && "bg-primary text-white",
                        status === "locked" && "bg-muted text-muted-foreground"
                      )}
                    >
                      {lesson.lesson_number}
                    </div>
                  </div>

                  {/* Lesson Info */}
                  <div
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 w-48",
                      isLeft ? "right-full mr-20" : "left-full ml-20"
                    )}
                  >
                    <div className="bg-card border shadow-md rounded-lg p-4 space-y-1">
                      <h3 className="font-semibold text-sm">{lesson.title}</h3>
                      <p className="text-xs text-muted-foreground">{lesson.topic}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Center circle on the line */}
              <div
                className={cn(
                  "absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full",
                  status === "completed" && "bg-success",
                  status === "available" && "bg-primary",
                  status === "locked" && "bg-muted"
                )}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LearningPathMap;
