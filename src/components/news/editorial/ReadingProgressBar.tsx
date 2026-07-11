import { useEffect, useState } from 'react';

// Sticky 2px scroll-progress bar pinned to the top of the viewport while the
// user scrolls through an article. Functional motion (a progress indicator),
// allowed under design rules. Hides itself entirely if reduced-motion is set
// — the bar would still be useful, but the design system prefers static UI in
// that mode and a 0%→100% morph is the only animated state.
export function ReadingProgressBar() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const handle = () => {
      const el = document.scrollingElement || document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      const next = max > 0 ? Math.min(100, Math.max(0, (el.scrollTop / max) * 100)) : 0;
      setPct(next);
    };
    handle();
    window.addEventListener('scroll', handle, { passive: true });
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle);
      window.removeEventListener('resize', handle);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 h-[2px] bg-transparent z-50 pointer-events-none motion-reduce:hidden"
    >
      <div
        className="h-full w-full bg-foreground origin-left"
        style={{ transform: `scaleX(${pct / 100})`, transition: 'transform 80ms linear' }}
      />
    </div>
  );
}
