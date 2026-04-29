import { useEffect, useState } from "react";
import { findExisting, type ExistingMatch } from "../../shared/api";

/**
 * Reverse-lookup the canonical queer.guide entity (if any) for the URL of
 * the first detected item. Best-effort: errors are swallowed so the
 * popup never blocks on this query.
 */
export function useExisting(sourceUrl: string | undefined): ExistingMatch | null {
  const [match, setMatch] = useState<ExistingMatch | null>(null);
  useEffect(() => {
    if (!sourceUrl) { setMatch(null); return; }
    let cancelled = false;
    void (async () => {
      try {
        const m = await findExisting(sourceUrl);
        if (!cancelled) setMatch(m);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [sourceUrl]);
  return match;
}
