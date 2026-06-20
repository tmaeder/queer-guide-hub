import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { STICKERS } from '@/lib/messageRender';

interface StickerPickerProps {
  onSelect: (emoji: string) => void;
  trigger: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

/** Bundled queer-joy sticker pack — sends a large standalone sticker. */
export function StickerPicker({ onSelect, trigger, side = 'top', align = 'end' }: StickerPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side={side} align={align} className="w-[280px] p-2">
        <p className="mb-2 px-1 text-sm font-medium">
          {t('chat.stickers.title', { defaultValue: 'Stickers' })}
        </p>
        <div className="grid grid-cols-4 gap-1">
          {STICKERS.map((s) => (
            <button
              key={s.id}
              type="button"
              title={s.label}
              onClick={() => {
                onSelect(s.emoji);
                setOpen(false);
              }}
              className="flex h-14 items-center justify-center rounded-element text-3xl transition-colors hover:bg-muted"
            >
              {s.emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
