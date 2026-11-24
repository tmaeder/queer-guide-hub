import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TRAVEL_ACTIVITIES, type TravelActivity } from '@/lib/travelMeet';

export interface TravelMeetDraft {
  title: string;
  description: string;
  activity: TravelActivity;
  hostKind: 'traveller' | 'local';
}
export function TravelMeetComposer({
  initial,
  busy,
  signedIn,
  onSubmit,
  onCancel,
  summary,
}: {
  initial?: Partial<TravelMeetDraft>;
  summary?: string;
  busy: boolean;
  signedIn: boolean;
  onSubmit: (draft: TravelMeetDraft) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [consented, setConsented] = useState(false);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [activity, setActivity] = useState<TravelActivity>(initial?.activity ?? 'coffee');
  const [hostKind, setHostKind] = useState<'traveller' | 'local'>(initial?.hostKind ?? 'traveller');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (consented && title.trim().length >= 3)
      onSubmit({ title: title.trim(), description: description.trim(), activity, hostKind });
  };
  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-6 rounded-container bg-surface-container p-6 sm:p-8"
      aria-label={t('travelMeet.compose', 'Invite someone along')}
    >
      <h2
        id="travel-meet-compose-heading"
        tabIndex={-1}
        className="font-display text-headline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t('travelMeet.compose', 'Invite someone along')}
      </h2>
      {summary && <p className="font-semibold">{summary}</p>}
      <p className="max-w-reading text-muted-foreground">
        {t(
          'travelMeet.composeHelp',
          'Suggest something small to do during your selected dates. Choose a public meeting place; leave out your accommodation and private contact details.',
        )}
      </p>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="meet-activity">
            {t('travelMeet.activity', 'What would you like to do?')}
          </Label>
          <select
            id="meet-activity"
            className="min-h-11 w-full rounded-element border border-input bg-background px-4"
            value={activity}
            onChange={(e) => setActivity(e.target.value as TravelActivity)}
          >
            {TRAVEL_ACTIVITIES.map((a) => (
              <option key={a} value={a}>
                {t(`travelMeet.activities.${a}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="meet-host-kind">{t('travelMeet.hostKind', 'I am…')}</Label>
          <select
            id="meet-host-kind"
            className="min-h-11 w-full rounded-element border border-input bg-background px-4"
            value={hostKind}
            onChange={(e) => setHostKind(e.target.value as 'traveller' | 'local')}
          >
            <option value="traveller">{t('travelMeet.visiting', 'Visiting')}</option>
            <option value="local">{t('travelMeet.liveHere', 'A local')}</option>
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="meet-title">{t('travelMeet.titleLabel', 'Your invitation')}</Label>
        <Input
          id="meet-title"
          required
          minLength={3}
          maxLength={100}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('travelMeet.titlePlaceholder', 'Coffee and a gallery visit on Saturday?')}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="meet-description">
          {t('travelMeet.details', 'A little more detail (optional)')}
        </Label>
        <Textarea
          id="meet-description"
          maxLength={600}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <label className="flex items-start gap-4 text-sm">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          required
          className="mt-1 size-4 shrink-0 accent-foreground"
        />
        <span>
          {t(
            'travelMeet.consent',
            'Share this invitation and its dates with signed-in members. My trip and itinerary stay private. The invitation expires after its end date.',
          )}
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !consented || title.trim().length < 3}>
          {busy
            ? t('travelMeet.saving', 'Saving…')
            : signedIn
              ? t('travelMeet.publish', 'Publish invitation')
              : t('travelMeet.signInPublish', 'Sign in to publish')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('travelMeet.cancel', 'Cancel')}
        </Button>
      </div>
    </form>
  );
}
