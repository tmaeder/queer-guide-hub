import type { ReactNode } from 'react';

interface PageIntroProps {
  title: ReactNode;
  lede?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** Shared title and lede for top-level destinations, inside the page's own container. */
export function PageIntro({ title, lede, className, children }: PageIntroProps) {
  return (
    <div className={className}>
      <h1 className="m-0 max-w-reading text-balance text-display leading-tight md:text-hero">
        {title}
      </h1>
      {lede && (
        <p className="mt-4 max-w-reading text-body-lg leading-relaxed text-muted-foreground">
          {lede}
        </p>
      )}
      {children}
    </div>
  );
}
