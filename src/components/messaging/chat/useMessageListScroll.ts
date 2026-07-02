import { useEffect, useRef, useState } from 'react';

/**
 * Owns the chat scroll + focus + scroll-to-message highlight choreography.
 * Extracted verbatim from ChatView — behavior-preserving.
 */
export function useMessageListScroll(conversationId: string, messagesLength: number) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesLength]);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [conversationId]);

  const scrollToMessage = (messageId: string) => {
    document.getElementById(`msg-${messageId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    setHighlightedId(messageId);
    setTimeout(() => setHighlightedId((cur) => (cur === messageId ? null : cur)), 1500);
  };

  return { highlightedId, messagesEndRef, inputRef, scrollToMessage };
}
