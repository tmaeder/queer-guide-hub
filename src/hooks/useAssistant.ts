import { useCallback, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { askAssistant, type AssistantCard } from '@/lib/assistantClient';

export interface AssistantMessage {
  role: 'user' | 'assistant';
  text: string;
  cards?: AssistantCard[];
}

/**
 * Drives the inline "Ask" chat in the search popover. Holds the conversation
 * turns + the worker-issued conversation_id so follow-ups keep context.
 * Non-streaming: one request per send(), a pending flag while awaiting.
 */
export function useAssistant() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const inFlightRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (message: string, turnstileToken?: string | null) => {
      const text = message.trim();
      if (!text || pending) return;

      inFlightRef.current?.abort();
      const controller = new AbortController();
      inFlightRef.current = controller;

      setError(null);
      setPending(true);
      setMessages((prev) => [...prev, { role: 'user', text }]);

      try {
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
        setError(err instanceof Error ? err.message : "Couldn't reach the guide.");
      } finally {
        if (inFlightRef.current === controller) inFlightRef.current = null;
        setPending(false);
      }
    },
    [pending, user],
  );

  const reset = useCallback(() => {
    inFlightRef.current?.abort();
    inFlightRef.current = null;
    conversationIdRef.current = undefined;
    setMessages([]);
    setError(null);
    setPending(false);
  }, []);

  return { messages, pending, error, send, reset };
}
