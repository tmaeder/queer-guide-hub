import { useEffect, useRef } from 'react';

// Sticky 2px scroll-progress bar pinned to the top of the viewport while the
// user scrolls through an article. Functional motion (a progress indicator),
// allowed under design rules. Hides itself entirely if reduced-motion is set
// — the bar would still be useful, but the design system prefers static UI in
// that mode and a 0%→100% morph is the only animated state.
//
// Smoothness is why this writes the transform on a ref instead of holding the
// percentage in state. Two things used to make it stutter: a React re-render
// per scroll event (scroll fires faster than paint, so most renders were
// thrown away and the rest landed late), and a `transition` on the transform.
// A transition interpolating toward a target that moves every frame always
// trails the scroll and rubber-bands when it stops — the value is already
// frame-accurate, so the animation belongs to the scroll, not to CSS. The rAF
// gate coalesces every event in a frame into one write.
export function ReadingProgressBar() {
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;

    const paint = () => {
      frame = 0;
      const fill = fillRef.current;
      if (!fill) return;
      const el = document.scrollingElement || document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0;
      fill.style.transform = `scaleX(${ratio})`;
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(paint);
    };

    paint();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 h-[2px] bg-transparent z-50 pointer-events-none motion-reduce:hidden"
    >
      <div
        ref={fillRef}
        className="h-full w-full bg-foreground origin-left will-change-transform"
        style={{ transform: 'scaleX(0)' }}
      />
    </div>
  );
}
