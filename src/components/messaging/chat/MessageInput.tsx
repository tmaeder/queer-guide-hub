import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { useTranslation } from 'react-i18next';
import { sanitizeToText } from '@/lib/sanitize';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  ImagePlus,
  ScanLine,
  Send,
  Smile,
  Sparkles,
  Sticker as StickerIcon,
  X,
} from '@/components/icons';
import { EmojiPicker } from '@/components/messaging/EmojiPicker';
import { StickerPicker } from '@/components/messaging/StickerPicker';
import { pickIcebreaker } from '@/lib/icebreakers';
import type { ChatImage } from '@/hooks/useChatImageUpload';

interface MessageInputProps {
  onSend: (content: string) => void | boolean | Promise<void | boolean>;
  draftKey?: string;
  onTyping: () => void;
  onStopTyping: () => void;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
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
  draftKey,
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
  const storageKey = draftKey ? `chat-draft:${draftKey}` : null;
  const [message, setMessage] = useState(() => {
    try {
      return storageKey ? (sessionStorage.getItem(storageKey) ?? '') : '';
    } catch {
      return '';
    }
  });
  const [toolsOpen, setToolsOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const sendingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const busy = disabled || sending;
  const updateMessage = (value: string) => {
    setMessage(value);
    try {
      if (storageKey) {
        if (value) sessionStorage.setItem(storageKey, value);
        else sessionStorage.removeItem(storageKey);
      }
    } catch {
      /* Drafts still work in memory when browser storage is unavailable. */
    }
  };
  useLayoutEffect(() => {
    const input = textareaRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight || 44, 160)}px`;
  }, [message]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // An image (or an in-flight upload) lets us send with an empty caption.
  const canSendEmpty = !!pendingImage || !!uploadingImage;

  // Allow parents (e.g. IntimateMatchThread opening-move chips) to seed the
  // composer. Setting from an external value via effect is intentional here.
  useEffect(() => {
    if (prefilledMessage) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setMessage(prefilledMessage);
      try {
        if (storageKey) sessionStorage.setItem(storageKey, prefilledMessage);
      } catch {
        /* Storage may be unavailable. */
      }

      inputRef?.current?.focus();
    }
  }, [prefilledMessage, inputRef, storageKey]);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Append an emoji to the composer text.
  const addEmoji = (emoji: string) => {
    updateMessage(message + emoji);
    inputRef?.current?.focus();
  };

  // Sanitize and trim only when sending, so editing preserves the user's draft.
  const sanitizeMessage = (input: string) => sanitizeToText(input).trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadingImage || busy || sendingRef.current) return;
    const sanitizedMessage = sanitizeMessage(message);
    if (!sanitizedMessage && !pendingImage) return;
    sendingRef.current = true;
    setSending(true);
    setSendFailed(false);
    try {
      const result = await onSend(sanitizedMessage);
      if (result === false) {
        setSendFailed(true);
        return;
      }
      updateMessage('');
      onStopTyping();
    } catch {
      setSendFailed(true);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const handlePickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onPickImage?.(file);
    e.target.value = ''; // allow re-picking the same file
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Every space is trailing when first typed; trimming here removes word separators.
    updateMessage(e.target.value);

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
    // Phone keyboards need Return for multiline drafts; the Send button stays explicit.
    if (window.matchMedia('(max-width: 767px)').matches && !e.ctrlKey && !e.metaKey) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      void handleSubmit(e);
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
      className="shrink-0 border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-4"
      aria-busy={sending}
    >
      {/* Staged image preview */}
      {(pendingImage || uploadingImage) && (
        <div className="flex items-center gap-2">
          <div className="relative h-16 w-16 overflow-hidden rounded-element bg-muted">
            {pendingImage ? (
              <img src={pendingImage.url} alt="" className="h-full w-full object-cover" />
            ) : null}
            {uploadingImage && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                <TrackLoader size={18} />
              </div>
            )}
            {pendingImage && !uploadingImage && onClearImage && (
              <button
                type="button"
                onClick={onClearImage}
                aria-label={t('chat.image.remove', { defaultValue: 'Remove image' })}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 min-h-11 min-w-11 items-center justify-center rounded-full bg-foreground text-background"
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

      {sendFailed && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {t('chat.composer.sendFailed', {
            defaultValue: 'Message not sent. Your draft is safe. Try sending again.',
          })}
        </p>
      )}
      <div className="flex items-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
          disabled={busy}
          aria-expanded={toolsOpen}
          aria-controls="chat-composer-tools"
          aria-label={t('chat.composer.tools', { defaultValue: 'Message tools' })}
          onClick={() => setToolsOpen((open) => !open)}
        >
          <Plus size={20} />
        </Button>
        <Textarea
          ref={(element) => {
            textareaRef.current = element;
            if (inputRef) inputRef.current = element;
          }}
          rows={1}
          enterKeyHint="enter"
          aria-label={t('chat.composer.label', { defaultValue: 'Message' })}
          value={message}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={t('chat.composer.placeholder', { defaultValue: 'Type a message…' })}
          disabled={busy}
          className="max-h-40 min-h-11 flex-1 resize-none rounded-element text-base md:text-sm"
          maxLength={2000}
        />

        <Button
          type="submit"
          disabled={busy || uploadingImage || (!message.trim() && !canSendEmpty)}
          aria-label={
            sending
              ? t('chat.composer.sending', { defaultValue: 'Sending…' })
              : t('chat.composer.send', { defaultValue: 'Send message' })
          }
          className="h-11 w-11 shrink-0 rounded-element p-0"
          size="sm"
        >
          {sending ? <TrackLoader size={20} /> : <Send size={20} />}
        </Button>
      </div>
      <div id="chat-composer-tools" hidden={!toolsOpen} className="mt-2 flex flex-wrap gap-1">
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
              disabled={busy || uploadingImage}
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
          disabled={busy}
          aria-label={t('chat.composer.spark', { defaultValue: 'Spark a conversation' })}
          onClick={() => {
            updateMessage(pickIcebreaker(Date.now()));
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
            disabled={busy}
            aria-label={t('chat.composer.addToGuide', { defaultValue: 'Add to Queer Guide' })}
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
                disabled={busy}
                aria-label={t('chat.composer.stickers', { defaultValue: 'Stickers' })}
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
              disabled={busy}
              aria-label={t('chat.composer.emoji', { defaultValue: 'Emoji' })}
            >
              <Smile size={20} />
            </Button>
          }
        />
      </div>
    </form>
  );
};
