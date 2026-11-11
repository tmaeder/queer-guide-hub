import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, MoreHorizontal } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { EXPLORE_SETTLE_MS, isExploreBodyEmpty } from './exploreEmpty';

export function LocationOverview({
  children,
  className,
  label = 'Overview',
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn('grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6', className)}
    >
      {children}
    </section>
  );
}

export function LocationActionMenu({
  label = 'More actions',
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          className="inline-flex items-center gap-2 rounded-element px-4 py-2 text-13 font-bold transition-colors hover:bg-surface-container active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        align="end"
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
        className="flex min-w-56 flex-col gap-1 p-2 [&_a]:w-full [&_a]:justify-start [&_button]:w-full [&_button]:justify-start"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

export interface LocationExploreGroup {
  id: string;
  title: string;
  summary?: string;
  content: React.ReactNode;
}

/**
 * Every rail inside a group decides for itself whether it has anything and
 * returns null when it does not, so the group cannot know up front. Measured
 * on prod: "Community and local supporters" opened onto nothing on Berlin,
 * Columbus and Hatboro for a signed-out reader, and "People, landmarks and
 * guides" onto nothing on Hatboro — a heading and a chevron promising a
 * section that was not there.
 *
 * So the group watches its own body once mounted: when nothing has changed
 * for EXPLORE_SETTLE_MS and the body is still empty, the group is hidden. It
 * stays mounted while hidden, so a rail that answers late (a slow network)
 * mutates the body and the group comes back.
 */
function useSettledEmpty(bodyRef: React.RefObject<HTMLDivElement | null>, active: boolean) {
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    const body = bodyRef.current;
    if (!active || !body || typeof MutationObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      if (timer) clearTimeout(timer);
      if (!isExploreBodyEmpty(body)) {
        setEmpty(false);
        return;
      }
      timer = setTimeout(() => setEmpty(isExploreBodyEmpty(body)), EXPLORE_SETTLE_MS);
    };
    const observer = new MutationObserver(settle);
    observer.observe(body, { childList: true, subtree: true, characterData: true });
    settle();
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [bodyRef, active]);
  return empty;
}

function ExploreGroup({
  group,
  onEmptyChange,
}: {
  group: LocationExploreGroup;
  onEmptyChange: (id: string, empty: boolean) => void;
}) {
  const rootRef = useRef<HTMLDetailsElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const empty = useSettledEmpty(bodyRef, mounted);
  useEffect(() => onEmptyChange(group.id, empty), [onEmptyChange, group.id, empty]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || mounted || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setMounted(true);
        observer.disconnect();
      },
      { rootMargin: '320px 0px' },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [mounted]);

  return (
    <details
      ref={rootRef}
      id={group.id}
      onToggle={(event) => {
        if (event.currentTarget.open) setMounted(true);
      }}
      hidden={empty}
      data-empty={empty || undefined}
      className="group border-t border-border-hairline py-4 first:border-t-0"
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-element py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-title font-bold leading-tight">{group.title}</span>
          {group.summary && (
            <span className="mt-1 block max-w-reading text-13 leading-relaxed text-muted-foreground">
              {group.summary}
            </span>
          )}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="mt-1 h-5 w-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div ref={bodyRef} className="pt-6">
        {mounted ? group.content : null}
      </div>
    </details>
  );
}

export function LocationExploreMore({
  title,
  groups,
}: {
  title?: string;
  groups: LocationExploreGroup[];
}) {
  const { t } = useTranslation();
  const [emptyIds, setEmptyIds] = useState<ReadonlySet<string>>(() => new Set());
  const onEmptyChange = useCallback((id: string, empty: boolean) => {
    setEmptyIds((prev) => {
      if (prev.has(id) === empty) return prev;
      const next = new Set(prev);
      if (empty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  if (!groups.length) return null;
  // Every group came back empty: the "Explore more" heading would stand over
  // nothing. Hidden, not unmounted, so a late answer can still bring it back.
  const allEmpty = groups.every((g) => emptyIds.has(g.id));
  return (
    <section aria-labelledby="location-explore-more" hidden={allEmpty}>
      <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
        {t('common.keepGoing', 'Keep going')}
      </p>
      <h2 id="location-explore-more" className="mt-1 font-display text-headline leading-tight">
        {title ?? t('common.exploreMore', 'Explore more')}
      </h2>
      <div className="mt-4">
        {groups.map((group) => (
          <ExploreGroup key={group.id} group={group} onEmptyChange={onEmptyChange} />
        ))}
      </div>
    </section>
  );
}
