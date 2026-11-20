import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
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

  const hasVibe = !!(current?.vibe_text || current?.vibe_emoji);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
            {t('chat.vibe.title', { defaultValue: 'Your vibe' })}
          </h4>
          {hasVibe && (
            <button
              type="button"
              onClick={clear}
              disabled={saving}
              className="rounded-badge text-xs font-bold underline underline-offset-4 disabled:opacity-40"
            >
              {t('common.clear', { defaultValue: 'Clear' })}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-element bg-card p-1.5 shadow-soft">
          <EmojiPicker
            onSelect={setEmoji}
            side="bottom"
            align="start"
            trigger={
              <button
                type="button"
                aria-label={t('chat.vibe.emoji', { defaultValue: 'Pick an emoji' })}
                className="flex size-11 shrink-0 items-center justify-center rounded-element text-xl hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {emoji || '✨'}
              </button>
            }
          />
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 80))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
            }}
            placeholder={t('chat.vibe.placeholder', { defaultValue: "What's your vibe?" })}
            aria-label={t('chat.vibe.title', { defaultValue: 'Your vibe' })}
            className="h-11 min-w-0 flex-1 bg-transparent text-15 placeholder:text-muted-foreground focus:outline-none"
            maxLength={80}
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => save(4)} disabled={saving}>
            {t('chat.vibe.for4h', { defaultValue: '4h' })}
          </Button>
          <Button size="sm" onClick={() => save()} disabled={saving}>
            {t('common.save', { defaultValue: 'Save' })}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
          {t('status.lookingFor', { defaultValue: 'Looking for' })}
        </h4>
        <IntentChips />
        <p className="text-xs text-muted-foreground">
          {t('status.lookingForHint', {
            defaultValue: 'Helps rank people for you. Not shown on your profile.',
          })}
        </p>
      </section>
    </div>
  );
}
