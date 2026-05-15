import { cn } from "@/lib/utils";
import { type HTMLAttributes, type ReactNode } from "react";

export function BentoGrid({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("grid grid-cols-12 auto-rows-min gap-px bg-border", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export interface BentoCellProps {
  span?: number;
  rowSpan?: number;
  title?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
}

export function BentoCell({
  span = 3,
  rowSpan = 1,
  title,
  action,
  children,
  className,
  interactive,
  onClick,
}: BentoCellProps) {
  return (
    <section
      onClick={onClick}
      className={cn(
        "bg-background p-4 flex flex-col gap-3 min-h-[140px]",
        interactive && "hover:bg-muted/30 cursor-pointer",
        className,
      )}
      style={{
        gridColumn: `span ${span} / span ${span}`,
        gridRow: `span ${rowSpan} / span ${rowSpan}`,
      }}
    >
      {(title || action) && (
        <header className="flex items-center justify-between">
          {typeof title === "string" ? (
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {title}
            </h3>
          ) : (
            title
          )}
          {action}
        </header>
      )}
      <div className="flex-1">{children}</div>
    </section>
  );
}
