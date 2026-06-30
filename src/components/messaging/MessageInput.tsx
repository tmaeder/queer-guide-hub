import React, { useState, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Smile, Sparkles, Sticker as StickerIcon } from 'lucide-react';
import { EmojiPicker } from '@/components/messaging/EmojiPicker';
import { StickerPicker } from '@/components/messaging/StickerPicker';
import { pickIcebreaker } from '@/lib/icebreakers';

interface MessageInputProps {
  onSend: (content: string) => void;
  onTyping: () => void;
  onStopTyping: () => void;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
  /** Pre-populate the composer with this text. Latest non-empty value wins. */
  prefilledMessage?: string | null;
  /** Send a sticker (standalone large emoji) immediately. */
  onSticker?: (emoji: string) => void;
}

export const MessageInput = ({
  onSend,
  onTyping,
  onStopTyping,
  disabled,
  inputRef,
  prefilledMessage,
  onSticker,
}: MessageInputProps) => {
  const [message, setMessage] = useState('');

  // Allow parents (e.g. IntimateMatchThread opening-move chips) to seed the
  // composer. Setting from an external value via effect is intentional here.
  useEffect(() => {
    if (prefilledMessage) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setMessage(prefilledMessage);

      inputRef?.current?.focus();
    }
  }, [prefilledMessage, inputRef]);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  // Append an emoji to the composer text.
  const addEmoji = (emoji: string) => {
    setMessage((prev) => prev + emoji);
    inputRef?.current?.focus();
  };

  // Sanitize message input to prevent XSS
  const sanitizeMessage = (input: string): string => {
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    }).trim();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sanitizedMessage = sanitizeMessage(message);
    if (sanitizedMessage && !disabled) {
      onSend(sanitizedMessage);
      setMessage('');
      onStopTyping();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = sanitizeMessage(e.target.value);
    setMessage(value);

    // Send typing indicator
    onTyping();

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 1 second of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      onStopTyping();
    }, 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
    }
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        borderTop: '1px solid var(--border)',
        backgroundColor: 'color-mix(in srgb, var(--background) 50%, transparent)',
        backdropFilter: 'blur(8px)',
      }}
      className="flex gap-2 p-4"
    >
      <Input
        ref={inputRef}
        value={message}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        disabled={disabled}
        className="rounded-element"
        style={{ flex: 1, height: 44, transition: 'border-color 0.2s' }}
        maxLength={2000}
      />

      {/* Spark: drop an icebreaker into the composer */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-element p-0"
        style={{ height: 44, width: 44 }}
        disabled={disabled}
        aria-label="Spark a conversation"
        onClick={() => {
          setMessage(pickIcebreaker(Date.now()));
          inputRef?.current?.focus();
        }}
      >
        <Sparkles size={20} />
      </Button>

      {/* Sticker Picker */}
      {onSticker && (
        <StickerPicker
          onSelect={onSticker}
          side="top"
          align="end"
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-element p-0"
              style={{ height: 44, width: 44 }}
              disabled={disabled}
              aria-label="Stickers"
            >
              <StickerIcon size={20} />
            </Button>
          }
        />
      )}

      {/* Emoji Picker */}
      <EmojiPicker
        onSelect={addEmoji}
        side="top"
        align="end"
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-element p-0"
            style={{ height: 44, width: 44 }}
            disabled={disabled}
          >
            <Smile size={20} />
          </Button>
        }
      />

      <Button
        type="submit"
        disabled={disabled || !message.trim()}
        className="rounded-element p-0"
        style={{ height: 44, width: 44, transition: 'all 0.2s' }}
        size="sm"
      >
        <Send size={20} />
      </Button>
    </form>
  );
};
