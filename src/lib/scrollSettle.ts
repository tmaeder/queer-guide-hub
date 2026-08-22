/**
 * Scroll an element into view and re-scroll a few times while the layout
 * settles — the site header collapses to its compact height on the first
 * scroll, which moves the target by ~64px (see useActiveStation and the
 * /rights hash effect, which use the same correction).
 */
export function scrollToIdSettled(id: string, attempts = 4, stepMs = 100): void {
  let n = 0;
  const timer = window.setInterval(() => {
    const el = document.getElementById(id);
    if (!el) {
      window.clearInterval(timer);
      return;
    }
    el.scrollIntoView({ block: 'start' });
    if (++n >= attempts) window.clearInterval(timer);
  }, stepMs);
  // First jump immediately — the interval alone would wait a beat.
  document.getElementById(id)?.scrollIntoView({ block: 'start' });
}
