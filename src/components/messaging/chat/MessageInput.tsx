import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImagePlus, Loader2, ScanLine, Send, Smile, Sparkles, Sticker as StickerIcon, X } from 'lucide-react';
import { EmojiPicker } from '@/components/messaging/EmojiPicker';
import { StickerPicker } from '@/components/messaging/StickerPicker';
import { pickIcebreaker } from '@/lib/icebreakers';
import type { ChatImage } from '@/hooks/useChatImageUpload';

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
  /** Open the in-chat submit sheet (scan a link/flyer into Queer Guide). */
  onOpenSubmit?: () => void;
  /** Upload a picked image file (owner tracks pending/uploading state). */
  onPickImage?: (file: File) => void;
  /** The staged image preview shown above the composer, if any. */
  pendingImage?: ChatImage | null;
  /** True while an image is uploading. */
  uploadingImage?: boolean;
  /** Remove the staged image before sending. */
  onClearImage?: () => void;
}

export const MessageInput = ({
  onSend,
  onTyping,
  onStopTyping,
  disabled,
  inputRef,
  prefilledMessage,
  onSticker,
  onOpenSubmit,
  onPickImage,
  pendingImage,
  uploadingImage,
  onClearImage,
}: MessageInputProps) => {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // An image (or an in-flight upload) lets us send with an empty caption.
  const canSendEmpty = !!pendingImage || !!uploadingImage;

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
    if (uploadingImage) return; // wait for the upload to finish
    const sanitizedMessage = sanitizeMessage(message);
    if ((sanitizedMessage || canSendEmpty) && !disabled) {
      onSend(sanitizedMessage);
      setMessage('');
      onStopTyping();
    }
  };

  const handlePickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onPickImage?.(file);
    e.target.value = ''; // allow re-picking the same file
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
      className="flex flex-col gap-2 p-4"
    >
      {/* Staged image preview */}
      {(pendingImage || uploadingImage) && (
        <div className="flex items-center gap-2">
          <div className="relative h-16 w-16 overflow-hidden rounded-element border border-border bg-muted">
            {pendingImage ? (
              <img src={pendingImage.url} alt="" className="h-full w-full object-cover" />
            ) : null}
            {uploadingImage && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                <Loader2 size={18} className="animate-spin text-muted-foreground" />
              </div>
            )}
            {pendingImage && !uploadingImage && onClearImage && (
              <button
                type="button"
                onClick={onClearImage}
                aria-label={t('chat.image.remove', { defaultValue: 'Remove image' })}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {uploadingImage
              ? t('chat.image.uploading', { defaultValue: 'Uploading…' })
              : t('chat.image.ready', { defaultValue: 'Add a caption or send' })}
          </span>
        </div>
      )}

      <div className="flex gap-2">
      <Input
        ref={inputRef}
        value={message}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder={t('chat.composer.placeholder', { defaultValue: 'Type a message…' })}
        disabled={disabled}
        className="rounded-element"
        style={{ flex: 1, height: 44, transition: 'border-color 0.2s' }}
        maxLength={2000}
      />

      {/* Image upload */}
      {onPickImage && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePickImage}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-element p-0"
            style={{ height: 44, width: 44 }}
            disabled={disabled || uploadingImage}
            aria-label={t('chat.image.add', { defaultValue: 'Add photo' })}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus size={20} />
          </Button>
        </>
      )}

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

      {/* In-chat submit: scan a link/flyer into Queer Guide */}
      {onOpenSubmit && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-element p-0"
          style={{ height: 44, width: 44 }}
          disabled={disabled}
          aria-label="Add to Queer Guide"
          onClick={onOpenSubmit}
        >
          <ScanLine size={20} />
        </Button>
      )}

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
        disabled={disabled || uploadingImage || (!message.trim() && !canSendEmpty)}
        className="rounded-element p-0"
        style={{ height: 44, width: 44, transition: 'all 0.2s' }}
        size="sm"
      >
        <Send size={20} />
      </Button>
      </div>
    </form>
  );
};
