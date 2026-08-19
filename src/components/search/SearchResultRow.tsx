import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';
import { RouteBullet } from '@/components/transit/RouteBullet';
import { ROUTE_BULLET_MAP } from '@/components/transit/routeBulletMap';

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
  /** search_documents entity type — picks the route bullet's letter and line. */
  type: string;
  name: string;
  nameHtml?: string | null;
  query?: string;
  subtitle?: string;
  /** Right-hand kind label. Defaults to the bullet's own label. */
  kind?: string;
  focused?: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
}

/**
 * One result row: `[bullet] [name over subtitle] [kind]`, per the mock's
 * `grid-template-columns: 40px 1fr auto`.
 *
 * The 48px image thumbnail this used to lead with is gone deliberately. Two
 * reasons, and the second is the real one: a mixed-type list is exactly what
 * the route bullet exists to type — the letter says WHAT it is and the colour
 * says which line it is on, which a photo of a bar cannot — and roughly half
 * the corpus (cities, tags, people, guides, news) has no usable image, so the
 * thumbnail column was mostly an empty grey well acting as a lookup key.
 */
export function SearchResultRow({
  id,
  type,
  name,
  nameHtml,
  query = '',
  subtitle,
  kind,
  focused = false,
  onClick,
  onMouseEnter,
}: SearchResultRowProps) {
  const label = kind ?? ROUTE_BULLET_MAP[type]?.label ?? type;
  return (
    <div
      id={id}
      role="option"
      aria-selected={focused}
      aria-label={subtitle ? `${name}, ${subtitle}` : name}
      tabIndex={-1}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick();
      }}
      className={cn(
        'flex min-h-[56px] cursor-pointer items-center gap-4 border-b border-foreground/10 px-6 py-2 transition-colors last:border-b-0',
        focused
          ? 'bg-surface-container outline outline-2 -outline-offset-2 outline-ring'
          : 'hover:bg-surface-container',
      )}
    >
      <RouteBullet type={type} size={34} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-15 font-bold">
          <HighlightedText text={name} query={query} html={nameHtml} />
        </span>
        {subtitle && <span className="truncate text-13 text-muted-foreground">{subtitle}</span>}
      </div>
      <span className="shrink-0 text-2xs font-bold uppercase tracking-label text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
