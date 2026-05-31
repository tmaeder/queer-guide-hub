import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

/**
 * Cloudflare Turnstile widget.
 *
 * Supabase Auth (GoTrue) is configured with CAPTCHA protection, so every
 * password sign-in / sign-up / password-reset request must carry a
 * `captchaToken`. This widget renders the Turnstile challenge and hands the
 * resulting token back to the parent form via `onVerify`.
 *
 * The site key is PUBLIC (it is meant to ship in client code) and is read from
 * the `VITE_TURNSTILE_SITE_KEY` build-time env var. It must match the secret
 * key configured in the Supabase dashboard (Authentication → Bot & Abuse
 * Protection). When the env var is unset (e.g. local dev with CAPTCHA disabled,
 * or unit tests) the widget renders nothing and `isTurnstileEnabled` is false,
 * so forms submit without a token.
 */

const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() || undefined;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

/** True when a Turnstile site key is configured at build time. */
// eslint-disable-next-line react-refresh/only-export-components -- build-time constant colocated with the widget it gates; not a fast-refresh hazard.
export const isTurnstileEnabled = Boolean(SITE_KEY);

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Failed to load Cloudflare Turnstile'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface TurnstileHandle {
  /** Reset the widget to obtain a fresh single-use token (e.g. after a failed submit). */
  reset: () => void;
}

interface TurnstileWidgetProps {
  /** Called with a fresh token whenever the challenge is solved. */
  onVerify: (token: string) => void;
  /** Called when the token expires or the challenge errors out. */
  onExpire?: () => void;
  className?: string;
}

export const TurnstileWidget = forwardRef<TurnstileHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ onVerify, onExpire, className }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);

    // Keep latest callbacks in refs so the widget mounts only once and never
    // re-renders on parent state changes (a re-render would drop the token).
    const onVerifyRef = useRef(onVerify);
    const onExpireRef = useRef(onExpire);
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;

    useImperativeHandle(ref, () => ({
      reset() {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
    }), []);

    useEffect(() => {
      if (!SITE_KEY) return;
      let cancelled = false;

      loadTurnstileScript()
        .then(() => {
          if (cancelled || !containerRef.current || !window.turnstile) return;
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: SITE_KEY,
            theme: 'auto',
            callback: (token: string) => onVerifyRef.current(token),
            'expired-callback': () => onExpireRef.current?.(),
            'error-callback': () => onExpireRef.current?.(),
          });
        })
        .catch((err) => {
          console.error('Turnstile init failed:', err);
        });

      return () => {
        cancelled = true;
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            // widget already gone — ignore
          }
          widgetIdRef.current = null;
        }
      };
    }, []);

    if (!SITE_KEY) return null;

    return <div ref={containerRef} className={className} />;
  },
);
