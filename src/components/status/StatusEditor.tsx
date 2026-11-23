import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmojiPicker } from '@/components/messaging/EmojiPicker';
import { useProfile } from '@/hooks/useProfile';
import { IntentChips } from '@/components/status/IntentChips';
import { Clock, Plane, X } from '@/components/icons';
import { ToggleChip } from '@/components/ui/ToggleChip';
import { USER_MODES } from '@/config/navigation';
import { useUserMode } from '@/hooks/useUserMode';
import { useUserIntent, useDerivedTravelIntent } from '@/hooks/useUserIntent';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';

type VibeProfile = {
  vibe_emoji?: string | null;
  vibe_text?: string | null;
} | null;

/**
 * THE one editor for "who you are right now": the ephemeral mood line (vibe),
 * the discovery mode, what you're looking for, and where you're heading. The
 * People sheet ("I'm here for…"), the "Set a vibe" popover and Settings all
 * mount this, so the four signals are never edited in two places. Body only —
 * containers provide the chrome. Every section self-saves; `onDone` lets a
 * popover close after a vibe save/clear.
 *
 * `compact`: the vibe line only. Used in the Hub sheet, where space is tight.
 */
export function StatusEditor({
  onDone,
  compact = false,
}: {
  onDone?: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const current = profile as VibeProfile;
  const [emoji, setEmoji] = useState(current?.vibe_emoji ?? '✨');
  const [text, setText] = useState(current?.vibe_text ?? '');
  const [saving, setSaving] = useState(false);
  const [for4h, setFor4h] = useState(false);
  const { mode, setMode } = useUserMode();

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

  // Clear is offered only when there is a saved line to clear.
  const hasVibe = !!current?.vibe_text;

  return (
    <div className="flex flex-col gap-4">
      {/* One line: emoji, text, save. Clear lives inside the field; the 4-hour
          option is a toggle rather than a second save button. */}
      <section className="flex flex-col gap-2">
        {!compact && (
          <h4 className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
            {t('chat.vibe.title', { defaultValue: 'Your vibe' })}
          </h4>
        )}
        <div className="flex items-center gap-1 rounded-full bg-card p-1 shadow-soft">
          <EmojiPicker
            onSelect={setEmoji}
            side="bottom"
            align="start"
            trigger={
              <button
                type="button"
                aria-label={t('chat.vibe.emoji', { defaultValue: 'Pick an emoji' })}
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-xl transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {emoji || '✨'}
              </button>
            }
          />
          <input
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 80))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save(for4h ? 4 : undefined);
            }}
            placeholder={t('chat.vibe.placeholder', { defaultValue: "What's your vibe?" })}
            aria-label={t('chat.vibe.title', { defaultValue: 'Your vibe' })}
            className="h-10 min-w-0 flex-1 bg-transparent px-1 text-15 placeholder:text-muted-foreground focus:outline-none"
            maxLength={80}
          />
          {hasVibe && (
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
            onClick={() => save(for4h ? 4 : undefined)}
            disabled={saving}
          >
            {t('common.save', { defaultValue: 'Save' })}
          </Button>
        </div>
        <button
          type="button"
          aria-pressed={for4h}
          onClick={() => setFor4h((v) => !v)}
          className={`inline-flex min-h-8 items-center gap-1.5 self-start rounded-full px-4 text-xs font-semibold transition-colors ${
            for4h
              ? 'bg-foreground text-background'
              : 'bg-card text-muted-foreground hover:text-foreground'
          }`}
        >
          <Clock size={14} aria-hidden />
          {t('chat.vibe.for4h', { defaultValue: '4h' })}
        </button>
      </section>

      {!compact && (
        <section className="flex flex-col gap-2">
          <h4
            id="status-mode"
            className="text-2xs font-bold uppercase tracking-wide text-muted-foreground"
          >
            {t('people.intent.mode', { defaultValue: "What you're here for" })}
          </h4>
          <div role="group" aria-labelledby="status-mode" className="flex flex-wrap gap-1.5">
            {USER_MODES.map(({ value, icon: Icon, labelKey }) => (
              <ToggleChip
                key={value}
                pressed={mode === value}
                onPressedChange={() => setMode(value)}
                icon={<Icon size={14} aria-hidden />}
              >
                {t(labelKey)}
              </ToggleChip>
            ))}
          </div>
        </section>
      )}

      {!compact && (
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
      )}

      {!compact && <TravelSection onDone={onDone} />}
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

  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
        {t('people.intent.travel', { defaultValue: 'Travel' })}
      </h4>
      {active ? (
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
      ) : derived?.cityName ? (
        <button
          type="button"
          onClick={useTrip}
          className="flex w-full items-center gap-2 rounded-container bg-card px-4 py-2 text-left shadow-soft transition-colors hover:bg-surface-container"
        >
          <Plane className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-sm">
            {t('people.intent.travelSuggest', {
              defaultValue: 'Heading to {{city}} — let others going there find you',
              city: derived.cityName,
            })}
          </span>
        </button>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t(
            'people.intent.travelEmpty',
            'Plan a trip to find travel buddies heading to the same place.',
          )}
        </p>
      )}
    </section>
  );
}
