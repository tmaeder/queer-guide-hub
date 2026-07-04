import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { StatusEditor } from '@/components/status/StatusEditor';
import { useProfile } from '@/hooks/useProfile';

type VibeProfile = {
  vibe_emoji?: string | null;
  vibe_text?: string | null;
} | null;

/**
 * Messages-rail entry point for the unified status editor: shows the current
 * vibe as the trigger label, opens the shared StatusEditor (mood line +
 * looking-for intent) in a popover.
 */
export function VibeEditor() {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const current = profile as VibeProfile;
  const [open, setOpen] = useState(false);

  const label = current?.vibe_text
    ? `${current.vibe_emoji ?? '✨'} ${current.vibe_text}`
    : t('chat.vibe.set', { defaultValue: 'Set a vibe' });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 max-w-[160px] gap-1 px-2 text-13">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-4">
        <StatusEditor onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
