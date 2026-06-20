import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmojiPicker } from '@/components/messaging/EmojiPicker';
import { useProfile } from '@/hooks/useProfile';

type VibeProfile = {
  vibe_emoji?: string | null;
  vibe_text?: string | null;
} | null;

/**
 * Lets the current user set a short "vibe" (emoji + ≤80 chars) shown to people
 * they chat with. Optional auto-clear presets keep it fresh.
 */
export function VibeEditor() {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const current = profile as VibeProfile;
  const [open, setOpen] = useState(false);
  const [emoji, setEmoji] = useState(current?.vibe_emoji ?? '✨');
  const [text, setText] = useState(current?.vibe_text ?? '');
  const [saving, setSaving] = useState(false);

  const save = async (clearAfterHours?: number) => {
    setSaving(true);
    const now = new Date();
    const expires = clearAfterHours
      ? new Date(now.getTime() + clearAfterHours * 3600_000).toISOString()
      : null;
    await updateProfile({
      vibe_emoji: emoji || null,
      vibe_text: text.trim() || null,
      vibe_set_at: now.toISOString(),
      vibe_expires_at: expires,
    } as unknown as Parameters<typeof updateProfile>[0]);
    setSaving(false);
    setOpen(false);
  };

  const clear = async () => {
    setSaving(true);
    setText('');
    await updateProfile({
      vibe_emoji: null,
      vibe_text: null,
      vibe_set_at: null,
      vibe_expires_at: null,
    } as unknown as Parameters<typeof updateProfile>[0]);
    setSaving(false);
    setOpen(false);
  };

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
      <PopoverContent align="end" className="w-[280px] p-3">
        <p className="mb-2 text-sm font-medium">{t('chat.vibe.title', { defaultValue: 'Your vibe' })}</p>
        <div className="flex items-center gap-2">
          <EmojiPicker
            onSelect={setEmoji}
            side="bottom"
            align="start"
            trigger={
              <Button variant="outline" size="sm" className="h-9 w-10 shrink-0 p-0 text-lg">
                {emoji || '✨'}
              </Button>
            }
          />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 80))}
            placeholder={t('chat.vibe.placeholder', { defaultValue: "What's your vibe?" })}
            className="h-9 rounded-element"
            maxLength={80}
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={clear} disabled={saving}>
            {t('common.clear', { defaultValue: 'Clear' })}
          </Button>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => save(4)} disabled={saving}>
              {t('chat.vibe.for4h', { defaultValue: '4h' })}
            </Button>
            <Button size="sm" onClick={() => save()} disabled={saving}>
              {t('common.save', { defaultValue: 'Save' })}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
