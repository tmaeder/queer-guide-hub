import * as React from 'react';

interface DeferredSectionProps {
  children: React.ReactNode;
  /** Skeleton/placeholder shown until the section nears the viewport. */
  fallback?: React.ReactNode;
  /** Reserved height for the placeholder so deferred mounting causes no CLS. */
  minHeight?: number | string;
  rootMargin?: string;
}

/**
 * Defers mounting (and therefore data fetching) of a below-fold section until
 * it approaches the viewport. React.lazy only defers code — without this, every
 * homepage section fires its queries at first paint. Mounts immediately when
 * IntersectionObserver is unavailable (jsdom, ancient browsers).
 */
export function DeferredSection({
  children,
  fallback = null,
  minHeight,
  rootMargin = '800px 0px',
}: DeferredSectionProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(
    () => typeof IntersectionObserver === 'undefined',
  );

  React.useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [visible, rootMargin]);

  if (visible) return <>{children}</>;

  return (
    <div ref={ref} style={minHeight != null ? { minHeight } : undefined}>
      {fallback}
    </div>
  );
}
