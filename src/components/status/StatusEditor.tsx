import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmojiPicker } from '@/components/messaging/EmojiPicker';
import { useProfile } from '@/hooks/useProfile';
import { IntentChips } from '@/components/status/IntentChips';
import { Plane, X } from '@/components/icons';
import { useUserIntent, useDerivedTravelIntent } from '@/hooks/useUserIntent';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';

type VibeProfile = {
  vibe_emoji?: string | null;
  vibe_text?: string | null;
} | null;

/**
 * THE one editor for "who you are right now": a vibe line, one multi-select
 * "here for" row (user_mode is derived from it — see useUserIntent), and the
 * trip you're heading to when there is one. Mounted by the mobile Hub menu, the
 * "Set a vibe" popover and Settings. Every part self-saves; `onDone` lets a
 * popover close after a vibe save/clear.
 */
export function StatusEditor({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const current = profile as VibeProfile;
  const [emoji, setEmoji] = useState(current?.vibe_emoji ?? '✨');
  const [text, setText] = useState(current?.vibe_text ?? '');
  const [saving, setSaving] = useState(false);

  const writeVibe = async (next: { emoji: string | null; text: string | null }) => {
    setSaving(true);
    await updateProfile({
      vibe_emoji: next.emoji,
      vibe_text: next.text,
      vibe_set_at: next.text ? new Date().toISOString() : null,
      vibe_expires_at: null,
    } as unknown as Parameters<typeof updateProfile>[0]);
    setSaving(false);
    onDone?.();
  };
  const save = () => writeVibe({ emoji: emoji || null, text: text.trim() || null });
  const clear = () => {
    setText('');
    void writeVibe({ emoji: null, text: null });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 rounded-full bg-card p-1 shadow-soft">
        <EmojiPicker
          onSelect={setEmoji}
          side="bottom"
          align="start"
          trigger={
            <button
              type="button"
              aria-label={t('chat.vibe.emoji', { defaultValue: 'Pick an emoji' })}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          className="h-10 min-w-0 flex-1 bg-transparent px-1 text-15 placeholder:text-muted-foreground focus:outline-none"
          maxLength={80}
        />
        {current?.vibe_text && (
          <button
            type="button"
            onClick={clear}
            disabled={saving}
            aria-label={t('common.clear', { defaultValue: 'Clear' })}
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <X size={16} aria-hidden />
          </button>
        )}
        <Button
          size="sm"
          className="h-10 shrink-0 rounded-full px-4"
          onClick={save}
          disabled={saving}
        >
          {t('common.save', { defaultValue: 'Save' })}
        </Button>
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="status-here-for">
        <h4
          id="status-here-for"
          className="text-2xs font-bold uppercase tracking-wide text-muted-foreground"
        >
          {t('status.hereFor', { defaultValue: "I'm here for" })}
        </h4>
        <IntentChips />
      </section>

      <TravelSection onDone={onDone} />
    </div>
  );
}

/** Where you're heading — offered straight from your next trip so a
 *  destination is never re-typed. */
function TravelSection({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { travel, setTravel } = useUserIntent();
  const { data: derived } = useDerivedTravelIntent();
  const active = travel?.city_id ?? travel?.city_name;

  const useTrip = async () => {
    if (!derived) return;
    await setTravel({
      city_id: derived.cityId ?? undefined,
      city_name: derived.cityName ?? undefined,
      until: derived.endDate ?? undefined,
    });
    onDone?.();
    navigate(`/meet/travel?tripId=${derived.tripId}`);
  };

  if (!active && !derived?.cityName) return null;

  return active ? (
    <div className="flex items-center justify-between gap-4 rounded-container bg-card px-4 py-2 shadow-soft">
      <span className="flex items-center gap-2 text-sm">
        <Plane className="h-4 w-4 text-muted-foreground" aria-hidden />
        {t('people.intent.travelActive', {
          defaultValue: 'Visible to people in {{city}}',
          city: travel?.city_name ?? t('people.intent.yourCity', 'your destination'),
        })}
      </span>
      <Button variant="soft" size="sm" onClick={() => setTravel(null)}>
        {t('common.clear', { defaultValue: 'Clear' })}
      </Button>
    </div>
  ) : (
    <button
      type="button"
      onClick={useTrip}
      className="flex w-full items-center gap-2 rounded-container bg-card px-4 py-2 text-left shadow-soft transition-colors hover:bg-surface-container"
    >
      <Plane className="h-4 w-4 text-muted-foreground" aria-hidden />
      <span className="text-sm">
        {t('people.intent.travelSuggest', {
          defaultValue: 'Heading to {{city}} — let others going there find you',
          city: derived?.cityName,
        })}
      </span>
    </button>
  );
}
