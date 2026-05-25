import { ArrowUp } from 'lucide-react';

interface NewStoriesPillProps {
  count: number;
  onRefresh: () => void;
  /** When count exceeds this, render with a "+" suffix. */
  cap?: number;
}

// Sticky pill that appears at the top of /news when new articles arrive via
// Realtime. Click → user-initiated refresh (no auto-jump, no lost scroll).
// Hidden when count === 0.
export function NewStoriesPill({ count, onRefresh, cap = 25 }: NewStoriesPillProps) {
  if (count === 0) return null;
  const label = count >= cap ? `${cap}+` : String(count);
  return (
    <div className="sticky top-4 z-30 flex justify-center pointer-events-none mb-4">
      <button
        type="button"
        onClick={onRefresh}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-element border border-foreground bg-background px-4 py-2 text-13 font-semibold hover:bg-foreground hover:text-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-live="polite"
        aria-atomic="true"
      >
        <ArrowUp size={14} aria-hidden="true" />
        {label} new {count === 1 ? 'story' : 'stories'} — refresh
      </button>
    </div>
  );
}
