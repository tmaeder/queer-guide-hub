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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
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
