import { useEffect, useState } from 'react';

/** The design system's Loading Animation spec: "Under 400ms of expected wait,
 *  show nothing." */
export const LOADER_DELAY_MS = 400;

/** Same spec: "Over 8 seconds, the rider stops at a station and the copy
 *  explains what is slow. Never a spinner that lies." */
export const LOADER_SLOW_MS = 8000;

export interface LoaderPhase {
  /** False for the first 400ms — render nothing, not a loader. */
  visible: boolean;
  /** True past 8s — swap to copy that says what is slow. */
  slow: boolean;
}

/**
 * Turns a raw `isLoading` boolean into the three phases the spec describes,
 * so call sites stop having to remember two thresholds.
 *
 * The 400ms floor is the part most often skipped, and it is the part that
 * matters most: a loader that flashes for 200ms makes a fast response *feel*
 * slower than showing nothing would, because it draws the eye to a wait the
 * reader had not noticed.
 *
 * The 8s ceiling exists because an indicator that keeps moving forever is
 * lying — it claims progress it cannot see. Past that, the honest move is to
 * say which part is slow and offer a way out.
 */
export function useLoaderDelay(isLoading: boolean): LoaderPhase {
  const [visible, setVisible] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!isLoading) return;
    const show = setTimeout(() => setVisible(true), LOADER_DELAY_MS);
    const late = setTimeout(() => setSlow(true), LOADER_SLOW_MS);
    // Reset on CLEANUP rather than synchronously in the effect body. Two
    // reasons: setting state during render/effect-body is what
    // react-hooks/set-state-in-effect exists to catch, and clearing here is
    // what makes a second request start its 400ms delay from zero — leaving
    // the flags set would make the next load flash instantly, defeating the
    // rule this hook exists to enforce.
    return () => {
      clearTimeout(show);
      clearTimeout(late);
      setVisible(false);
      setSlow(false);
    };
  }, [isLoading]);

  return { visible: isLoading && visible, slow: isLoading && slow };
}
