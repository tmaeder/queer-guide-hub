import { cn } from "@/lib/utils";

interface LoadingProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
}

export function Loading({ size = "md", text, className }: LoadingProps) {
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8", 
    lg: "h-12 w-12"
  };

  const dotSizes = {
    sm: "h-1.5 w-1.5",
    md: "h-2 w-2",
    lg: "h-3 w-3"
  };

  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)}>
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "rounded-full bg-primary animate-pulse",
              dotSizes[size]
            )}
            style={{
              animationDelay: `${i * 0.2}s`,
              animationDuration: "1s"
            }}
          />
        ))}
      </div>
      {text && (
        <p className="text-sm text-muted-foreground animate-fade-in">
          {text}
        </p>
      )}
    </div>
  );
}

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8"
  };

  return (
    <div
      className={cn(
        "animate-spin rounded-full border-2 border-muted border-t-primary",
        sizeClasses[size],
        className
      )}
    />
  );
}

interface PageLoadingProps {
  text?: string;
}

export function PageLoading({ text = "Loading..." }: PageLoadingProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-6 animate-fade-in">
        {/* Main loading animation */}
        <div className="relative">
          <div className="flex items-center justify-center gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-3 w-3 rounded-full bg-primary animate-bounce"
                style={{
                  animationDelay: `${i * 0.1}s`,
                  animationDuration: "0.8s"
                }}
              />
            ))}
          </div>
          {/* Subtle glow effect */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-20 bg-primary/20 rounded-full blur-sm animate-pulse" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{text}</h2>
          <div className="flex items-center justify-center gap-1">
            <LoadingSpinner size="sm" />
            <span className="text-sm text-muted-foreground ml-2">Please wait</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface InlineLoadingProps {
  text?: string;
  size?: "sm" | "md";
}

export function InlineLoading({ text = "Loading...", size = "md" }: InlineLoadingProps) {
  return (
    <div className="flex items-center justify-center gap-3 py-8">
      <LoadingSpinner size={size} />
      <span className={cn(
        "text-muted-foreground animate-fade-in",
        size === "sm" ? "text-sm" : "text-base"
      )}>
        {text}
      </span>
    </div>
  );
}