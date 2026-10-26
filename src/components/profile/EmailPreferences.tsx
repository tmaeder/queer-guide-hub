import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
const topics = [
  ['newsletter', 'Newsletter'],
  ['product_updates', 'Product updates'],
  ['events', 'Event updates'],
] as const;
interface Subscription {
  status: string;
  topics: string[];
  locale: string;
}
interface DeliveryPreferences {
  dm_digest_enabled: boolean;
  group_mentions_enabled: boolean;
  trip_invites_enabled: boolean;
  operational_topics: string[];
  timezone: string;
  quiet_hours_enabled: boolean;
  quiet_start: number;
  quiet_end: number;
  version: number;
}
const defaultDelivery: DeliveryPreferences = {
  dm_digest_enabled: false,
  group_mentions_enabled: false,
  trip_invites_enabled: false,
  operational_topics: [],
  timezone: 'Etc/UTC',
  quiet_hours_enabled: false,
  quiet_start: 22,
  quiet_end: 8,
  version: 0,
};
export function EmailPreferences() {
  const { t, i18n } = useTranslation();
  const [subscription, setSubscription] = useState<Subscription | null>(null),
    [selected, setSelected] = useState<string[]>([]);
  const [delivery, setDelivery] = useState<DeliveryPreferences>(defaultDelivery);
  const [deliveryConflict, setDeliveryConflict] = useState(false);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [confirmation, setConfirmation] = useState(false);
  const load = useCallback(async (preserveActivity = false) => {
    try {
      const r = await supabase.functions.invoke('email-subscriptions', { method: 'GET' });
      if (r.error) throw r.error;
      setSubscription(r.data.subscription);
      if (!preserveActivity) {
        setDelivery({ ...defaultDelivery, ...r.data.delivery_preferences });
        setDeliveryConflict(false);
      }
      setSelected(r.data.subscription?.topics ?? []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Fetch remote preferences/workspace data on mount.
    void load();
  }, [load]);
  async function save(unsubscribe = false) {
    setBusy(true);
    try {
      const subscribing = !subscription || subscription.status === 'unsubscribed';
      const r = await supabase.functions.invoke('email-subscriptions', {
        body: {
          action: subscribing && !unsubscribe ? 'subscribe' : 'preferences',
          topics: selected,
          locale: subscription?.locale ?? i18n.resolvedLanguage?.split('-')[0] ?? 'en',
          consent: true,
          unsubscribe,
        },
      });
      if (r.error) throw r.error;
      if (subscribing && !unsubscribe) setConfirmation(true);
      await load(true);
      toast.success(t('emailPreferences.saved', 'Email preferences saved'));
    } catch {
      toast.error(
        t('emailPreferences.saveError', 'Could not save email preferences. Please retry.'),
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveDelivery() {
    setBusy(true);
    try {
      const r = await supabase.functions.invoke('email-subscriptions', {
        body: { action: 'delivery_preferences', ...delivery },
      });
      if (r.error) {
        if (r.error.context?.status === 409) setDeliveryConflict(true);
        throw r.error;
      }
      setDelivery({ ...defaultDelivery, ...r.data.delivery_preferences });
      toast.success(t('emailPreferences.saved', 'Email preferences saved'));
    } catch {
      toast.error(
        t('emailPreferences.saveError', 'Could not save email preferences. Please retry.'),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-labelledby="email-preferences-heading"
      className="space-y-4 border-t border-border pt-6"
    >
      <div>
        <h3 id="email-preferences-heading" className="font-semibold">
          {t('emailPreferences.title', 'Email updates')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t(
            'emailPreferences.description',
            'Choose your activity emails and updates. Essential account and service emails remain available.',
          )}
        </p>
      </div>
      {loading ? (
        <p role="status">{t('emailPreferences.loading', 'Loading email preferences…')}</p>
      ) : error ? (
        <div role="alert">
          <p>{t('emailPreferences.loadError', 'Email preferences could not load.')}</p>
          <Button variant="outline" onClick={() => void load()}>
            {t('common.retry', 'Retry')}
          </Button>
        </div>
      ) : (
        <>
          <fieldset disabled={busy} className="space-y-4">
            <legend className="font-medium">
              {t('emailPreferences.activity', 'Activity emails')}
            </legend>
            <div className="flex min-h-10 items-center gap-4">
              <input
                id="email-dm-digest"
                type="checkbox"
                checked={delivery.dm_digest_enabled}
                onChange={(e) => setDelivery({ ...delivery, dm_digest_enabled: e.target.checked })}
              />
              <Label htmlFor="email-dm-digest">
                {t('emailPreferences.dmDigest', 'Email me a daily unread-message digest')}
              </Label>
            </div>
            <div className="flex min-h-10 items-center gap-4">
              <input
                id="email-group-mentions"
                type="checkbox"
                checked={delivery.group_mentions_enabled}
                onChange={(e) =>
                  setDelivery({ ...delivery, group_mentions_enabled: e.target.checked })
                }
              />
              <Label htmlFor="email-group-mentions">
                {t(
                  'emailPreferences.groupMentions',
                  'Email me when I am mentioned in a group post',
                )}
              </Label>
            </div>
            <div className="flex min-h-10 items-center gap-4">
              <input
                id="email-trip-invites"
                type="checkbox"
                checked={delivery.trip_invites_enabled}
                onChange={(e) =>
                  setDelivery({ ...delivery, trip_invites_enabled: e.target.checked })
                }
              />
              <Label htmlFor="email-trip-invites">
                {t('emailPreferences.tripInvites', 'Email me when I receive a trip invitation')}
              </Label>
            </div>
            {(
              [
                ['event_updates', 'Email me schedule changes and reminders for events I joined'],
                [
                  'trip_updates',
                  'Email me schedule changes and UTC next-day reminders for my trips',
                ],
                ['group_invitations', 'Email me when I receive a group invitation'],
                ['group_requests', 'Email me the outcome of my group join requests'],
                ['group_comments', 'Email me mentions and replies in my groups'],
                ['community_comments', 'Email me mentions and replies in the community'],
                [
                  'business_updates',
                  'Email me claim and service updates for businesses I represent',
                ],
                ['contributions', 'Email me decisions on my contributions'],
                ['payments', 'Email me when a verified payment confirmation is ready'],
              ] as const
            ).map(([topic, label]) => (
              <div key={topic} className="flex min-h-10 items-center gap-4">
                <input
                  id={`email-operation-${topic}`}
                  type="checkbox"
                  disabled={busy}
                  checked={delivery.operational_topics.includes(topic)}
                  onChange={(e) =>
                    setDelivery({
                      ...delivery,
                      operational_topics: e.target.checked
                        ? [...delivery.operational_topics, topic]
                        : delivery.operational_topics.filter((t) => t !== topic),
                    })
                  }
                />
                <Label htmlFor={`email-operation-${topic}`}>{label}</Label>
              </div>
            ))}
            <p className="text-sm text-muted-foreground">
              {t(
                'emailPreferences.dmPrivacy',
                'Push notifications are controlled separately. Message text, group names and trip details stay in the app.',
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              {t(
                'emailPreferences.activityBudget',
                'All optional activity emails share a limit of one email per UTC day. Essential account emails remain available.',
              )}
            </p>
            <div className="flex min-h-10 items-center gap-4">
              <input
                id="email-quiet-hours"
                type="checkbox"
                checked={delivery.quiet_hours_enabled}
                onChange={(e) =>
                  setDelivery({ ...delivery, quiet_hours_enabled: e.target.checked })
                }
              />
              <Label htmlFor="email-quiet-hours">
                {t('emailPreferences.quietHours', 'Hold activity emails during quiet hours')}
              </Label>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="email-timezone">
                  {t('emailPreferences.timezone', 'Time zone')}
                </Label>
                <input
                  id="email-timezone"
                  className="h-10 w-full rounded-element border border-input bg-background px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={delivery.timezone}
                  maxLength={100}
                  placeholder="Europe/Zurich"
                  onChange={(e) => setDelivery({ ...delivery, timezone: e.target.value })}
                />
              </div>
              {(['quiet_start', 'quiet_end'] as const).map((field) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={`email-${field}`}>
                    {field === 'quiet_start'
                      ? t('emailPreferences.quietStart', 'Quiet hours start')
                      : t('emailPreferences.quietEnd', 'Quiet hours end')}
                  </Label>
                  <select
                    id={`email-${field}`}
                    disabled={!delivery.quiet_hours_enabled}
                    className="h-10 w-full rounded-element border border-input bg-background px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={delivery[field]}
                    onChange={(e) => setDelivery({ ...delivery, [field]: Number(e.target.value) })}
                  >
                    {Array.from({ length: 24 }, (_, hour) => (
                      <option key={hour} value={hour}>
                        {String(hour).padStart(2, '0')}:00
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <Button
              disabled={
                busy ||
                deliveryConflict ||
                !delivery.timezone.trim() ||
                (delivery.quiet_hours_enabled && delivery.quiet_start === delivery.quiet_end)
              }
              onClick={() => void saveDelivery()}
            >
              {t('emailPreferences.saveDelivery', 'Save activity email settings')}
            </Button>
          </fieldset>
          {deliveryConflict && (
            <div role="alert" className="space-y-2">
              <p>
                {t(
                  'emailPreferences.conflict',
                  'These settings changed in another session. Reload before saving.',
                )}
              </p>
              <Button variant="outline" disabled={busy} onClick={() => void load()}>
                {t('emailPreferences.reload', 'Reload email settings')}
              </Button>
            </div>
          )}
          <fieldset disabled={busy} className="space-y-4">
            <legend className="font-medium">
              {t('emailPreferences.topics', 'Newsletters and updates')}
            </legend>
            {topics.map(([value, label]) => (
              <div key={value} className="flex min-h-10 items-center gap-4">
                <input
                  id={`email-topic-${value}`}
                  type="checkbox"
                  checked={selected.includes(value)}
                  onChange={(e) =>
                    setSelected((prev) =>
                      e.target.checked ? [...prev, value] : prev.filter((x) => x !== value),
                    )
                  }
                />
                <Label htmlFor={`email-topic-${value}`}>
                  {t(`emailPreferences.${value}`, label)}
                </Label>
              </div>
            ))}
          </fieldset>
          <p className="text-sm text-muted-foreground">
            {t(
              'emailPreferences.availability',
              'Newsletter delivery is not available yet. You can confirm your subscription and save your choices now.',
            )}
          </p>
          {(confirmation || subscription?.status === 'pending') && (
            <p role="status" className="text-sm">
              {t(
                'emailPreferences.confirm',
                'Check your inbox and confirm your subscription. Unconfirmed subscriptions receive no newsletters.',
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-4">
            <Button
              disabled={
                busy ||
                (selected.length === 0 && (!subscription || subscription.status === 'unsubscribed'))
              }
              onClick={() => void save()}
            >
              {busy
                ? t('common.saving', 'Saving…')
                : subscription && subscription.status !== 'unsubscribed'
                  ? t('emailPreferences.save', 'Save email preferences')
                  : t('emailPreferences.subscribe', 'Request email subscription')}
            </Button>
            {subscription && subscription.status !== 'unsubscribed' && (
              <Button variant="outline" disabled={busy} onClick={() => void save(true)}>
                {t('emailPreferences.unsubscribe', 'Unsubscribe from updates')}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
