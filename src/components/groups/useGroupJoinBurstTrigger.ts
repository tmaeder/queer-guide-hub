import { useEffect, useRef, useState } from 'react';

/**
 * Queer-joy burst trigger for the Groups surface: fires once when
 * `isMember` flips from false to true (a successful join), mirroring
 * useJoyBurstTrigger's prev-vs-current pattern from the /messages motion
 * zone. Skips the very first render so an already-joined group mounting
 * doesn't fire a burst.
 */
export function useGroupJoinBurstTrigger(isMember: boolean | undefined) {
  const [joy, setJoy] = useState(false);
  const prevRef = useRef<boolean | undefined>(isMember);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevRef.current = isMember;
      return;
    }
    if (!prevRef.current && isMember) {
      setJoy(true);
    }
    prevRef.current = isMember;
  }, [isMember]);

  return { joy, setJoy };
}
