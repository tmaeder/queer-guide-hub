import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { ChatImageAttachment } from '@/components/messaging/chat/chatImage';

interface Props {
  image: ChatImageAttachment;
  caption?: string;
  isOwn: boolean;
  sending?: boolean;
  highlighted?: boolean;
}

/**
 * Renders a photo message: a rounded, click-to-zoom thumbnail (aspect-ratio
 * boxed via intrinsic width/height to avoid layout shift) with an optional
 * caption underneath.
 */
export const ImageMessageBubble = ({ image, caption, isOwn, sending, highlighted }: Props) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const hasCaption = !!caption?.trim();

  return (
    <div
      className="overflow-hidden"
      style={{
        borderRadius: 'var(--radius-container)',
        opacity: sending ? 0.6 : 1,
        ...(highlighted ? { boxShadow: '0 0 0 2px hsl(var(--foreground))' } : {}),
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full"
        aria-label={t('chat.image.view', { defaultValue: 'View photo' })}
      >
        <img
          src={image.url}
          width={image.width}
          height={image.height}
          loading="lazy"
          alt={caption?.trim() || t('chat.image.alt', { defaultValue: 'Photo' })}
          className="block h-auto w-full max-w-full object-cover"
          style={{ maxHeight: 360, aspectRatio: image.width && image.height ? `${image.width} / ${image.height}` : undefined }}
        />
      </button>

      {hasCaption && (
        <p
          className="whitespace-pre-wrap break-words px-4 py-2 text-sm"
          style={
            isOwn
              ? { backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }
              : { backgroundColor: 'var(--muted)' }
          }
        >
          {caption}
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">
            {caption?.trim() || t('chat.image.alt', { defaultValue: 'Photo' })}
          </DialogTitle>
          <img
            src={image.url}
            alt={caption?.trim() || t('chat.image.alt', { defaultValue: 'Photo' })}
            className="mx-auto max-h-[85vh] w-auto max-w-full rounded-container object-contain"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};
