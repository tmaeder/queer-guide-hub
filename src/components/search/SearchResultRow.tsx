import React from 'react';
import DOMPurify from 'dompurify';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

function sanitizeHighlight(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: ['em'], ALLOWED_ATTR: [] });
}

/** Renders a result name with the query match emphasized (server highlight HTML or client fallback). */
export function HighlightedText({
  text,
  query,
  html,
}: {
  text: string;
  query: string;
  html?: string | null;
}) {
  if (!text) return null;
  if (html && /<em>/i.test(html)) {
    return (
      <span
        dangerouslySetInnerHTML={{ __html: sanitizeHighlight(html) }}
        className="qg-search-highlight [&_em]:font-bold [&_em]:not-italic"
      />
    );
  }
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-transparent font-bold text-inherit underline underline-offset-2">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export interface SearchResultRowProps {
  id?: string;
  image?: string;
  Icon: React.ComponentType<{ className?: string }>;
  name: string;
  nameHtml?: string | null;
  query?: string;
  subtitle?: string;
  focused?: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
}

/**
 * One bold suggestion / card row: 48px thumbnail, semibold name with query
 * highlight, muted subtitle, full-bleed hover. Shared by the suggestion list
 * and the inline Ask-AI card list so they read identically.
 */
export function SearchResultRow({
  id,
  image,
  Icon,
  name,
  nameHtml,
  query = '',
  subtitle,
  focused = false,
  onClick,
  onMouseEnter,
}: SearchResultRowProps) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={focused}
      tabIndex={-1}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick();
      }}
      className={cn(
        'flex min-h-[56px] cursor-pointer items-center gap-4 px-4 py-2 transition-colors',
        focused ? 'bg-accent outline outline-1 -outline-offset-1 outline-ring' : 'hover:bg-accent',
      )}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-element border border-border bg-muted">
        {image ? (
          /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onError is a media-error handler, not a user-input listener. */
          <img
            src={image}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <Icon className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-15 font-semibold">
          <HighlightedText text={name} query={query} html={nameHtml} />
        </span>
        {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </div>
  );
}
