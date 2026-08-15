import { useEffect, useRef, useState } from 'react';

/**
 * Tracks which anchored section is currently in view. Returns a `[activeId, select]`
 * tuple — call `select(id)` from click handlers so a smooth-scroll doesn't get
 * fought by the IntersectionObserver while the scroll is settling.
 */
export function useActiveSection(ids: string[]): [string, (id: string) => void] {
  const [active, setActive] = useState<string>(ids[0] ?? '');
  const manualSelectAt = useRef<number>(0);

  useEffect(() => {
    if (ids.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() - manualSelectAt.current < 600) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const next = visible[0]?.target.id;
        if (next) setActive(next);
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const select = (id: string) => {
    manualSelectAt.current = Date.now();
    setActive(id);
  };

  return [active, select];
}
