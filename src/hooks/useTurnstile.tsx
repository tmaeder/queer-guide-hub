import { useCallback, useRef, useState } from 'react';
import {
  TurnstileWidget,
  isTurnstileEnabled,
  type TurnstileHandle,
} from '@/components/auth/TurnstileWidget';

/**
 * Wiring helper for the Cloudflare Turnstile CAPTCHA on auth forms.
 *
 * Returns the current `token` (null until the challenge is solved), a ready-to-render
 * `widget` element, a `reset()` to fetch a fresh single-use token after a failed
 * submit, and `required` (true when a site key is configured). When CAPTCHA is not
 * configured the widget renders nothing and `required` is false, so forms submit
 * normally.
 */
export function useTurnstile() {
  const [token, setToken] = useState<string | null>(null);
  const handleRef = useRef<TurnstileHandle>(null);

  const reset = useCallback(() => {
    setToken(null);
    handleRef.current?.reset();
  }, []);

  const widget = (
    <TurnstileWidget
      ref={handleRef}
      onVerify={setToken}
      onExpire={() => setToken(null)}
    />
  );

  return { token, widget, reset, required: isTurnstileEnabled };
}
