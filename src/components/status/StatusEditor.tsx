import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmojiPicker } from '@/components/messaging/EmojiPicker';
import { useProfile } from '@/hooks/useProfile';
import { IntentChips } from '@/components/status/IntentChips';

type VibeProfile = {
  vibe_emoji?: string | null;
  vibe_text?: string | null;
} | null;

/**
 * Unified status editor: the ephemeral mood line (vibe) and the persistent
 * "looking for" intent, presented as one concept. Body only — containers
 * provide the chrome (popover in the messages rail, accordion in settings).
 * Both sections self-save; `onDone` lets a popover close after save/clear.
 */
export function StatusEditor({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const current = profile as VibeProfile;
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
    onDone?.();
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
    onDone?.();
  };

  return (
    <div className="flex flex-col gap-6">
      <section>
        <p className="mb-2 text-sm font-medium">
          {t('chat.vibe.title', { defaultValue: 'Your vibe' })}
        </p>
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
        <div className="mt-4 flex items-center justify-between gap-2">
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
      </section>

      <section>
        <p className="mb-2 text-sm font-medium">
          {t('status.lookingFor', { defaultValue: 'Looking for' })}
        </p>
        <IntentChips />
        <p className="mt-2 text-xs text-muted-foreground">
          {t('status.lookingForHint', {
            defaultValue: 'Helps rank people for you. Not shown on your profile.',
          })}
        </p>
      </section>
    </div>
  );
}
