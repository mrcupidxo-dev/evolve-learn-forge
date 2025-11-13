import { Flame, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";

interface StreakDisplayProps {
  currentStreak: number;
  longestStreak: number;
}

const StreakDisplay = ({ currentStreak, longestStreak }: StreakDisplayProps) => {
  return (
    <Card className="p-4 bg-gradient-to-br from-secondary/10 to-secondary/5">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Flame className="w-6 h-6 text-secondary" />
            {currentStreak > 0 && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-secondary rounded-full flex items-center justify-center text-[10px] font-bold text-white">
                {currentStreak}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Current</p>
            <p className="text-lg font-bold">{currentStreak} days</p>
          </div>
        </div>

        <div className="h-12 w-px bg-border" />

        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-accent" />
          <div>
            <p className="text-xs text-muted-foreground">Best</p>
            <p className="text-lg font-bold">{longestStreak} days</p>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default StreakDisplay;
