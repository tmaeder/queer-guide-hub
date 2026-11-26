import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { ReactNode } from 'react';
import {
  Activity,
  Briefcase,
  CalendarDays,
  ClipboardCheck,
  Mail,
  MessageCircle,
  Moon,
  Newspaper,
  Plane,
  Sparkles,
  Ticket,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from '@/components/icons';
const topics = [
  ['newsletter', 'Newsletter', Newspaper],
  ['product_updates', 'Product updates', Sparkles],
  ['events', 'Event updates', CalendarDays],
] as const;

/** One checkbox row: icon, label, box on the right. The label is the accessible name. */
function CheckRow({
  id,
  icon,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  icon: ReactNode;
  label: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-12 items-center gap-2.5 py-1">
      <span className="text-muted-foreground" aria-hidden="true">
        {icon}
      </span>
      <Label htmlFor={id} className="flex-1 cursor-pointer text-sm font-normal leading-snug">
        {label}
      </Label>
      <input
        id={id}
        type="checkbox"
        className="size-5 shrink-0 cursor-pointer accent-foreground"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}

function RowGroup({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="rounded-element bg-muted px-4 pb-1 pt-2.5">
      <p className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
        <Icon size={14} aria-hidden className="shrink-0" />
        {title}
      </p>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}
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
const OPERATIONAL = {
  event_updates: {
    label: 'Email me schedule changes and reminders for events I joined',
    icon: Ticket,
  },
  trip_updates: {
    label: 'Email me schedule changes and UTC next-day reminders for my trips',
    icon: Plane,
  },
  group_invitations: { label: 'Email me when I receive a group invitation', icon: Mail },
  group_requests: { label: 'Email me the outcome of my group join requests', icon: UserPlus },
  group_comments: { label: 'Email me mentions and replies in my groups', icon: MessageCircle },
  community_comments: {
    label: 'Email me mentions and replies in the community',
    icon: MessageCircle,
  },
  business_updates: {
    label: 'Email me claim and service updates for businesses I represent',
    icon: Briefcase,
  },
  contributions: { label: 'Email me decisions on my contributions', icon: ClipboardCheck },
  payments: { label: 'Email me when a verified payment confirmation is ready', icon: Wallet },
} as const;
type OperationalTopic = keyof typeof OPERATIONAL;
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
  const operationalRows = (keys: readonly OperationalTopic[]) =>
    keys.map((topic) => {
      const { label, icon: Icon } = OPERATIONAL[topic];
      return (
        <CheckRow
          key={topic}
          id={`email-operation-${topic}`}
          icon={<Icon size={18} />}
          label={t(`emailPreferences.operational.${topic}`, label)}
          checked={delivery.operational_topics.includes(topic)}
          onChange={(on) =>
            setDelivery({
              ...delivery,
              operational_topics: on
                ? [...delivery.operational_topics, topic]
                : delivery.operational_topics.filter((x) => x !== topic),
            })
          }
        />
      );
    });
  return (
    <section
      aria-labelledby="email-preferences-heading"
      className="flex flex-col gap-4 rounded-container bg-card p-6 shadow-soft"
    >
      <div>
        <h3 id="email-preferences-heading" className="flex items-center gap-2.5 font-semibold">
          <Mail size={18} aria-hidden className="shrink-0 text-muted-foreground" />
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
          <fieldset disabled={busy} className="flex flex-col gap-2.5">
            <legend className="mb-4 flex items-center gap-2.5 font-semibold">
              <Activity size={18} aria-hidden className="shrink-0 text-muted-foreground" />
              {t('emailPreferences.activity', 'Activity emails')}
            </legend>
            <RowGroup
              icon={MessageCircle}
              title={t('emailPreferences.groups.messages', 'Messages')}
            >
              <CheckRow
                id="email-dm-digest"
                icon={<MessageCircle size={18} />}
                label={t('emailPreferences.dmDigest', 'Email me a daily unread-message digest')}
                checked={delivery.dm_digest_enabled}
                onChange={(v) => setDelivery({ ...delivery, dm_digest_enabled: v })}
              />
            </RowGroup>
            <RowGroup icon={Plane} title={t('emailPreferences.groups.trips', 'Trips & events')}>
              <CheckRow
                id="email-trip-invites"
                icon={<UserPlus size={18} />}
                label={t(
                  'emailPreferences.tripInvites',
                  'Email me when I receive a trip invitation',
                )}
                checked={delivery.trip_invites_enabled}
                onChange={(v) => setDelivery({ ...delivery, trip_invites_enabled: v })}
              />
              {operationalRows(['event_updates', 'trip_updates'])}
            </RowGroup>
            <RowGroup
              icon={Users}
              title={t('emailPreferences.groups.community', 'Groups & community')}
            >
              <CheckRow
                id="email-group-mentions"
                icon={<Users size={18} />}
                label={t(
                  'emailPreferences.groupMentions',
                  'Email me when I am mentioned in a group post',
                )}
                checked={delivery.group_mentions_enabled}
                onChange={(v) => setDelivery({ ...delivery, group_mentions_enabled: v })}
              />
              {operationalRows([
                'group_invitations',
                'group_requests',
                'group_comments',
                'community_comments',
              ])}
            </RowGroup>
            <RowGroup icon={UserCheck} title={t('emailPreferences.groups.account', 'Your account')}>
              {operationalRows(['business_updates', 'contributions', 'payments'])}
            </RowGroup>

            <div className="mt-4 flex flex-col gap-4 rounded-element border border-border p-4">
              <CheckRow
                id="email-quiet-hours"
                icon={<Moon size={18} />}
                label={t('emailPreferences.quietHours', 'Hold activity emails during quiet hours')}
                checked={delivery.quiet_hours_enabled}
                onChange={(v) => setDelivery({ ...delivery, quiet_hours_enabled: v })}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email-timezone">
                    {t('emailPreferences.timezone', 'Time zone')}
                  </Label>
                  <input
                    id="email-timezone"
                    className="h-10 w-full rounded-element border border-input bg-background px-4 text-base focus-visible:outline-none md:text-sm focus-visible:ring-2 focus-visible:ring-ring"
                    value={delivery.timezone}
                    maxLength={100}
                    placeholder="Europe/Zurich"
                    onChange={(e) => setDelivery({ ...delivery, timezone: e.target.value })}
                  />
                </div>
                {(['quiet_start', 'quiet_end'] as const).map((field) => (
                  <div key={field} className="flex flex-col gap-2">
                    <Label htmlFor={`email-${field}`}>
                      {field === 'quiet_start'
                        ? t('emailPreferences.quietStart', 'Quiet hours start')
                        : t('emailPreferences.quietEnd', 'Quiet hours end')}
                    </Label>
                    <select
                      id={`email-${field}`}
                      disabled={!delivery.quiet_hours_enabled}
                      className="h-10 w-full rounded-element border border-input bg-background px-4 text-base focus-visible:outline-none disabled:opacity-50 md:text-sm focus-visible:ring-2 focus-visible:ring-ring"
                      value={delivery[field]}
                      onChange={(e) =>
                        setDelivery({ ...delivery, [field]: Number(e.target.value) })
                      }
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
            </div>

            <p className="text-xs text-muted-foreground">
              {t(
                'emailPreferences.activityBudget',
                'All optional activity emails share a limit of one email per UTC day. Essential account emails remain available.',
              )}{' '}
              {t(
                'emailPreferences.dmPrivacy',
                'Push notifications are controlled separately. Message text, group names and trip details stay in the app.',
              )}
            </p>
            <Button
              className="self-start"
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
          <fieldset disabled={busy} className="flex flex-col gap-2 border-t border-border pt-6">
            <legend className="sr-only">
              {t('emailPreferences.topics', 'Newsletters and updates')}
            </legend>
            <p aria-hidden="true" className="mb-2 flex items-center gap-2.5 font-semibold">
              <Newspaper size={18} aria-hidden className="shrink-0 text-muted-foreground" />
              {t('emailPreferences.topics', 'Newsletters and updates')}
            </p>
            <div className="divide-y divide-border">
              {topics.map(([value, label, Icon]) => (
                <CheckRow
                  key={value}
                  id={`email-topic-${value}`}
                  icon={<Icon size={18} />}
                  label={t(`emailPreferences.${value}`, label)}
                  checked={selected.includes(value)}
                  onChange={(on) =>
                    setSelected((prev) => (on ? [...prev, value] : prev.filter((x) => x !== value)))
                  }
                />
              ))}
            </div>
          </fieldset>
          <p className="text-xs text-muted-foreground">
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
          <div className="flex flex-wrap gap-2">
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
