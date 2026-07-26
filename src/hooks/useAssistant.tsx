import { useCallback, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { askAssistant, AssistantException, type AssistantCard } from '@/lib/assistantClient';
import { TurnstileWidget, type TurnstileHandle } from '@/components/auth/TurnstileWidget';

export interface AssistantMessage {
  role: 'user' | 'assistant';
  text: string;
  cards?: AssistantCard[];
}

/**
 * Site key of the INVISIBLE "Queer Guide - Assistant" Turnstile widget —
 * separate from `VITE_TURNSTILE_SITE_KEY` (the managed auth-form widget) so
 * the two can be rotated and analyzed independently. Public by design.
 * When unset, no widget mounts and requests carry no token (the worker
 * fails open only while its TURNSTILE_SECRET is also unset).
 */
const ASSISTANT_SITE_KEY =
  (import.meta.env.VITE_TURNSTILE_ASSISTANT_SITE_KEY as string | undefined)?.trim() || undefined;

/** How long send() waits for the invisible challenge to mint a token. */
const TOKEN_WAIT_MS = 8_000;

/**
 * Drives the inline "Ask" chat in the search popover. Holds the conversation
 * turns + the worker-issued conversation_id so follow-ups keep context.
 * Non-streaming: one request per send(), a pending flag while awaiting.
 *
 * Anti-abuse: render the returned `turnstile` element wherever the chat UI is
 * mounted. The invisible widget mints single-use tokens in the background;
 * send() consumes one per request (the worker rejects token-less requests once
 * its TURNSTILE_SECRET is set) and resets the widget to mint the next.
 */
export function useAssistant() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const inFlightRef = useRef<AbortController | null>(null);

  const turnstileRef = useRef<TurnstileHandle>(null);
  const tokenRef = useRef<string | null>(null);
  const tokenWaitersRef = useRef<Array<(token: string | null) => void>>([]);

  const onTurnstileVerify = useCallback((token: string) => {
    const waiter = tokenWaitersRef.current.shift();
    if (waiter) waiter(token);
    else tokenRef.current = token;
  }, []);

  const onTurnstileExpire = useCallback(() => {
    tokenRef.current = null;
  }, []);

  /**
   * Consume the current token (tokens are single-use) and kick off minting of
   * the next one. Resolves null when no widget is configured, or when the
   * challenge doesn't produce a token within TOKEN_WAIT_MS (the worker then
   * decides — fail-open without a secret, 403 with one).
   */
  const takeToken = useCallback((): Promise<string | null> => {
    if (!ASSISTANT_SITE_KEY) return Promise.resolve(null);
    const token = tokenRef.current;
    if (token) {
      tokenRef.current = null;
      turnstileRef.current?.reset();
      return Promise.resolve(token);
    }
    return new Promise((resolve) => {
      const waiter = (t: string | null) => {
        clearTimeout(timer);
        turnstileRef.current?.reset();
        resolve(t);
      };
      const timer = setTimeout(() => {
        const i = tokenWaitersRef.current.indexOf(waiter);
        if (i >= 0) tokenWaitersRef.current.splice(i, 1);
        resolve(null);
      }, TOKEN_WAIT_MS);
      tokenWaitersRef.current.push(waiter);
    });
  }, []);

  const send = useCallback(
    async (message: string) => {
      const text = message.trim();
      if (!text || pending) return;

      inFlightRef.current?.abort();
      const controller = new AbortController();
      inFlightRef.current = controller;

      setError(null);
      setPending(true);
      setMessages((prev) => [...prev, { role: 'user', text }]);

      try {
        const turnstileToken = await takeToken();
        const res = await askAssistant({
          message: text,
          conversationId: conversationIdRef.current,
          userId: user?.id,
          signal: controller.signal,
          turnstileToken,
        });
        conversationIdRef.current = res.conversation_id;
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: res.reply, cards: res.cards },
        ]);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof AssistantException && err.message === 'turnstile_failed') {
          setError("Couldn't verify your browser. Reload the page and try again.");
        } else if (err instanceof AssistantException && err.message === 'rate_limited') {
          setError('Too many questions in a row — wait a minute and try again.');
        } else {
          setError(err instanceof Error ? err.message : "Couldn't reach the guide.");
        }
      } finally {
        if (inFlightRef.current === controller) inFlightRef.current = null;
        setPending(false);
      }
    },
    [pending, user, takeToken],
  );

  const reset = useCallback(() => {
    inFlightRef.current?.abort();
    inFlightRef.current = null;
    conversationIdRef.current = undefined;
    setMessages([]);
    setError(null);
    setPending(false);
  }, []);

  // Invisible (dashboard mode: Invisible) — renders no UI, just mints tokens.
  const turnstile = ASSISTANT_SITE_KEY ? (
    <div aria-hidden>
      <TurnstileWidget
        ref={turnstileRef}
        siteKey={ASSISTANT_SITE_KEY}
        action="assistant"
        onVerify={onTurnstileVerify}
        onExpire={onTurnstileExpire}
      />
    </div>
  ) : null;

  return { messages, pending, error, send, reset, turnstile };
}
