import { useCallback, useState } from 'react';

// Per-topic "last visited" timestamps, used to show "N new since your last
// visit" counters on the Topics tab. localStorage-only (a lightweight
// engagement cue, not worth a round-trip or migration).

const STORAGE_KEY = 'qg:news:topic-last-visit';

type VisitMap = Record<string, string>; // slug -> ISO timestamp

function readMap(): VisitMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const obj = raw ? (JSON.parse(raw) as unknown) : {};
    return obj && typeof obj === 'object' ? (obj as VisitMap) : {};
  } catch {
    return {};
  }
}

export function useTopicLastVisit() {
  const [map, setMap] = useState<VisitMap>(() => readMap());

  const lastVisit = useCallback((slug: string): number | null => {
    const iso = map[slug];
    if (!iso) return null;
    const ms = new Date(iso).getTime();
    return Number.isNaN(ms) ? null : ms;
  }, [map]);

  const markVisited = useCallback((slug: string) => {
    setMap((prev) => {
      const next = { ...prev, [slug]: new Date().toISOString() };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { lastVisit, markVisited };
}
