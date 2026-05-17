import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface LoadMoreSentinelProps {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

/**
 * IntersectionObserver-based "Load more" trigger. Auto-fires when the sentinel
 * scrolls into view; the visible button is the manual fallback for keyboard
 * users and when prefers-reduced-motion / disabled IO.
 */
export function LoadMoreSentinel({ hasMore, loading, onLoadMore }: LoadMoreSentinelProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || loading) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { rootMargin: '300px 0px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, loading, onLoadMore]);

  if (!hasMore) return null;

  return (
    <div
      ref={ref}
      className="flex items-center justify-center"
      style={{ marginTop: 32, marginBottom: 16, minHeight: 48 }}
    >
      <Button variant="outline" onClick={onLoadMore} disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="animate-spin" style={{ width: 14, height: 14, marginRight: 8 }} />
            {t('search.loading', 'Loading…')}
          </>
        ) : (
          t('search.loadMore', 'Load more')
        )}
      </Button>
    </div>
  );
}
