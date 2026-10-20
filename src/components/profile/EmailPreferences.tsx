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
export function EmailPreferences() {
  const { t, i18n } = useTranslation();
  const [subscription, setSubscription] = useState<Subscription | null>(null),
    [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [confirmation, setConfirmation] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await supabase.functions.invoke('email-subscriptions', { method: 'GET' });
      if (r.error) throw r.error;
      setSubscription(r.data.subscription);
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
      await load();
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
            'Choose the updates you want. Account and service emails are handled separately.',
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
            <legend className="sr-only">{t('emailPreferences.topics', 'Email topics')}</legend>
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
            <Button disabled={busy || selected.length === 0} onClick={() => void save()}>
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
