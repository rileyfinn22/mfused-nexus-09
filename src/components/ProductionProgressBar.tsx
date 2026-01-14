import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, Circle } from "lucide-react";

interface ProductionProgressBarProps {
  progress: number;
  stages?: { status: string }[];
  showLabels?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ProductionProgressBar({
  progress,
  stages,
  showLabels = false,
  size = 'md',
  className,
}: ProductionProgressBarProps) {
  const heights = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return 'bg-green-500';
    if (progress >= 60) return 'bg-blue-500';
    if (progress >= 30) return 'bg-amber-500';
    return 'bg-muted-foreground/50';
  };

  const getProgressGradient = (progress: number) => {
    if (progress >= 100) return 'from-green-400 to-green-600';
    if (progress >= 60) return 'from-blue-400 to-blue-600';
    if (progress >= 30) return 'from-amber-400 to-amber-600';
    return 'from-gray-300 to-gray-500';
  };

  // If stages are provided, show segmented progress
  if (stages && stages.length > 0) {
    const segmentWidth = 100 / stages.length;
    
    return (
      <div className={cn("space-y-1", className)}>
        <div className={cn("flex gap-0.5 w-full rounded-full overflow-hidden", heights[size])}>
          {stages.map((stage, index) => (
            <div
              key={index}
              className={cn(
                "flex-1 transition-colors",
                stage.status === 'completed' ? 'bg-green-500' :
                stage.status === 'in_progress' ? 'bg-blue-500' :
                'bg-muted'
              )}
            />
          ))}
        </div>
        {showLabels && (
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0%</span>
            <span className="font-medium text-foreground">{progress}%</span>
            <span>100%</span>
          </div>
        )}
      </div>
    );
  }

  // Standard progress bar
  return (
    <div className={cn("space-y-1", className)}>
      <div className={cn("w-full bg-muted rounded-full overflow-hidden", heights[size])}>
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 bg-gradient-to-r",
            getProgressGradient(progress)
          )}
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
      {showLabels && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0%</span>
          <span className="font-medium text-foreground">{progress}%</span>
          <span>100%</span>
        </div>
      )}
    </div>
  );
}

interface ProductionStatusIndicatorProps {
  progress: number;
  size?: 'sm' | 'md' | 'lg';
  showPercentage?: boolean;
  className?: string;
}

export function ProductionStatusIndicator({
  progress,
  size = 'md',
  showPercentage = true,
  className,
}: ProductionStatusIndicatorProps) {
  const sizes = {
    sm: { ring: 'w-8 h-8', icon: 'h-3 w-3', text: 'text-xs' },
    md: { ring: 'w-12 h-12', icon: 'h-4 w-4', text: 'text-sm' },
    lg: { ring: 'w-16 h-16', icon: 'h-5 w-5', text: 'text-base' },
  };

  const getStatusConfig = (progress: number) => {
    if (progress >= 100) {
      return { icon: CheckCircle2, color: 'text-green-500', ring: 'ring-green-500', bg: 'bg-green-500/10' };
    }
    if (progress > 0) {
      return { icon: Clock, color: 'text-blue-500', ring: 'ring-blue-500', bg: 'bg-blue-500/10' };
    }
    return { icon: Circle, color: 'text-muted-foreground', ring: 'ring-muted-foreground/30', bg: 'bg-muted' };
  };

  const config = getStatusConfig(progress);
  const Icon = config.icon;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "rounded-full flex items-center justify-center ring-2",
          sizes[size].ring,
          config.ring,
          config.bg
        )}
      >
        <Icon className={cn(sizes[size].icon, config.color)} />
      </div>
      {showPercentage && (
        <span className={cn("font-semibold", sizes[size].text, config.color)}>
          {progress}%
        </span>
      )}
    </div>
  );
}
