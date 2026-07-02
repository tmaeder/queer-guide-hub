import { useEffect, useRef, useState } from 'react';

/**
 * Queer-joy burst trigger: fires once when a match thread gets its first
 * message. Extracted verbatim from ChatView — behavior-preserving. The burst
 * itself (JoyBurst) stays reduced-motion-gated in its own component.
 */
export function useJoyBurstTrigger(conversationType: string | undefined, messagesLength: number) {
  const [joy, setJoy] = useState(false);
  const prevLenRef = useRef(0);
  useEffect(() => {
    const prev = prevLenRef.current;
    if (conversationType === 'match' && prev === 0 && messagesLength > 0) {
      setJoy(true);
    }
    prevLenRef.current = messagesLength;
  }, [messagesLength, conversationType]);

  return { joy, setJoy };
}
