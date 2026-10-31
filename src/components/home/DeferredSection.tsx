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
    // Keyboard readers must be able to reach links in an offscreen section.
    // Mount before Tab's default focus movement instead of letting focus skip
    // an otherwise empty placeholder and jump past the section.
    const revealForKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Tab') setVisible(true);
    };
    window.addEventListener('keydown', revealForKeyboard);
    return () => {
      io.disconnect();
      window.removeEventListener('keydown', revealForKeyboard);
    };
  }, [visible, rootMargin]);

  if (visible) return <>{children}</>;

  return (
    <div ref={ref} style={minHeight != null ? { minHeight } : undefined}>
      {fallback}
    </div>
  );
}
