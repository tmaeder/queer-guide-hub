import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Message } from '@/hooks/useMessaging';

/**
 * Owns the chat scroll + focus + scroll-to-message highlight choreography, plus
 * paginated-history behavior: fires `onReachTop` when the user scrolls near the
 * top (to load an older page) and preserves the viewport position across the
 * prepend so the list doesn't jump.
 *
 * Auto-scrolls to the bottom only when a message is APPENDED (newest id
 * changes), never when older messages are prepended.
 */
export function useMessageListScroll(
  conversationId: string,
  messages: Message[],
  onReachTop?: () => void,
  currentUserId?: string,
) {
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const nearBottom = useRef(true);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // ScrollArea root; the scrollable element is its Radix viewport child.
  const scrollRootRef = useRef<HTMLDivElement>(null);

  const getViewport = () =>
    scrollRootRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]') ?? null;

  const firstId = messages[0]?.id ?? null;
  const lastId = messages[messages.length - 1]?.id ?? null;
  const lastSenderId = messages[messages.length - 1]?.sender_id;

  const prev = useRef<{ convId: string; firstId: string | null; lastId: string | null }>({
    convId: conversationId,
    firstId: null,
    lastId: null,
  });
  // Distance from the top saved just before a prepend, so we can restore it.
  const pendingRestore = useRef<number | null>(null);

  const onReachTopRef = useRef(onReachTop);
  useEffect(() => {
    onReachTopRef.current = onReachTop;
  }, [onReachTop]);

  // Focus the composer when the conversation opens.
  useEffect(() => {
    // Avoid opening the software keyboard just by reading a conversation.
    if (!window.matchMedia('(min-width: 768px)').matches) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [conversationId]);

  // Load-older trigger: fire when scrolled near the top.
  useEffect(() => {
    const vp = getViewport();
    if (!vp) return;
    const handler = () => {
      nearBottom.current = vp.scrollHeight - vp.scrollTop - vp.clientHeight < 80;
      if (nearBottom.current) setHasNewMessages(false);
      if (vp.scrollTop < 120) {
        pendingRestore.current = vp.scrollHeight - vp.scrollTop;
        onReachTopRef.current?.();
      }
    };
    vp.addEventListener('scroll', handler, { passive: true });
    return () => vp.removeEventListener('scroll', handler);
  }, [conversationId]);

  // Append → stick to bottom; prepend → keep the reading position stable.
  useLayoutEffect(() => {
    const vp = getViewport();
    const p = prev.current;

    if (p.convId !== conversationId) {
      prev.current = { convId: conversationId, firstId, lastId };
      requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView());
      pendingRestore.current = null;
      nearBottom.current = true;
      return;
    }

    const appended = lastId !== p.lastId;
    const prepended = firstId !== p.firstId && lastId === p.lastId;

    if (prepended && vp && pendingRestore.current != null) {
      vp.scrollTop = vp.scrollHeight - pendingRestore.current;
      pendingRestore.current = null;
    } else if (appended) {
      const ownMessage = !!currentUserId && lastSenderId === currentUserId;
      if (!p.lastId || nearBottom.current || ownMessage) {
        messagesEndRef.current?.scrollIntoView({ block: 'end' });
      } else {
        // Reflect an external message arriving while the reader is away from the bottom.
        setHasNewMessages(true);
      }
    }

    prev.current = { convId: conversationId, firstId, lastId };
  }, [conversationId, firstId, lastId, lastSenderId, currentUserId]);

  const scrollToMessage = (messageId: string) => {
    document.getElementById(`msg-${messageId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    setHighlightedId(messageId);
    setTimeout(() => setHighlightedId((cur) => (cur === messageId ? null : cur)), 1500);
  };

  const jumpToLatest = () => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
    nearBottom.current = true;
    setHasNewMessages(false);
  };

  return {
    highlightedId,
    messagesEndRef,
    inputRef,
    scrollRootRef,
    scrollToMessage,
    hasNewMessages,
    jumpToLatest,
  };
}
