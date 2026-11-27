import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarDays, Info, Mail, Newspaper, Sparkles } from '@/components/icons';
import {
  TurnstileWidget,
  isTurnstileEnabled,
  type TurnstileHandle,
} from '@/components/auth/TurnstileWidget';
const topics = [
  ['newsletter', 'Newsletter'],
  ['product_updates', 'Product updates'],
  ['events', 'Event updates'],
] as const;
const TOPIC_META: Record<string, { icon: typeof Mail; hint: string }> = {
  newsletter: { icon: Newspaper, hint: 'Queer news and guides, now and then' },
  product_updates: { icon: Sparkles, hint: 'New features on Queer Guide' },
  events: { icon: CalendarDays, hint: 'Events coming up near you' },
};
export default function EmailUpdates() {
  const { t, i18n } = useTranslation();
  const emailSiteKey =
    (import.meta.env.VITE_TURNSTILE_EMAIL_SITE_KEY as string | undefined)?.trim() || undefined;
  const verificationEnabled = Boolean(emailSiteKey) || isTurnstileEnabled;
  const [email, setEmail] = useState(''),
    [selected, setSelected] = useState<string[]>(() => {
      const topic = new URLSearchParams(location.search).get('topic');
      return topics.some(([key]) => key === topic) ? [topic!] : [];
    }),
    [consent, setConsent] = useState(false),
    [mode, setMode] = useState<'subscribe' | 'manage'>('subscribe'),
    [proof, setProof] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null);
  const challenge = useRef<TurnstileHandle>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await supabase.functions.invoke('email-subscriptions', {
        body:
          mode === 'manage'
            ? { action: 'request_management', email: email.trim(), turnstileToken: proof }
            : {
                action: 'subscribe',
                email: email.trim(),
                locale: (i18n.resolvedLanguage ?? 'en').slice(0, 16),
                topics: selected,
                consent,
                turnstileToken: proof,
              },
      });
      if (r.error) throw new Error('request');
      setNotice(
        mode === 'manage'
          ? t(
              'emailUpdates.manageResult',
              'If this mailbox has a confirmed subscription, a private link will be sent. Please allow an hour before requesting another.',
            )
          : t(
              'emailUpdates.subscribeResult',
              'If confirmation is needed, check your inbox for a link. No subscription is active until confirmed.',
            ),
      );
    } catch {
      setError(
        t(
          'emailUpdates.error',
          'The request could not be completed. Check the email and verification, then try again.',
        ),
      );
    } finally {
      setBusy(false);
      setProof('');
      challenge.current?.reset();
    }
  }
  return (
    <PageContainer className="grid gap-8 lg:grid-cols-[2fr_3fr] lg:items-start lg:gap-12">
      <header className="space-y-4 lg:sticky lg:top-32">
        <span
          aria-hidden
          className="grid h-14 w-14 place-items-center rounded-full bg-foreground text-background"
        >
          <Mail size={24} />
        </span>
        <h1 className="font-display text-display leading-none">
          {t('emailUpdates.title', 'Email updates')}
        </h1>
        <p className="flex gap-2 rounded-container bg-muted p-4 text-15 leading-relaxed">
          <Info size={18} aria-hidden className="mt-0.5 shrink-0" />
          {t(
            'emailUpdates.availability',
            'Newsletter delivery is not available yet. You can confirm a subscription and save the updates you want to receive when it becomes available.',
          )}
        </p>
        <p className="text-13 text-muted-foreground">
          {t(
            'emailUpdates.separation',
            'These subscriptions are separate from account messages and the activity emails you control in account settings.',
          )}
        </p>
      </header>
      <div className="rounded-panel bg-card p-6 shadow-soft md:p-8">
        <div
          className="mb-6 grid grid-cols-2 gap-1 rounded-element bg-muted p-1"
          aria-label="Email update action"
        >
          <Button
            variant={mode === 'subscribe' ? 'default' : 'ghost'}
            disabled={busy}
            aria-pressed={mode === 'subscribe'}
            onClick={() => {
              setMode('subscribe');
              setProof('');
              setNotice(null);
              setError(null);
            }}
          >
            Subscribe to updates
          </Button>
          <Button
            variant={mode === 'manage' ? 'default' : 'ghost'}
            disabled={busy}
            aria-pressed={mode === 'manage'}
            onClick={() => {
              setMode('manage');
              setProof('');
              setNotice(null);
              setError(null);
            }}
          >
            Manage a subscription
          </Button>
        </div>
        <form onSubmit={submit} className="space-y-6">
          <fieldset disabled={busy} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="public-email-address">
                {t('emailUpdates.address', 'Email address')}
              </Label>
              <Input
                id="public-email-address"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {mode === 'subscribe' ? (
              <>
                <fieldset className="space-y-2">
                  <legend className="mb-4 text-title font-bold">
                    {t('emailUpdates.choose', 'Choose your updates')}
                  </legend>
                  {topics.map(([key, label]) => {
                    const meta = TOPIC_META[key];
                    const Icon = meta?.icon ?? Mail;
                    const on = selected.includes(key);
                    return (
                      <label
                        key={key}
                        htmlFor={`signup-${key}`}
                        className={`flex cursor-pointer items-center gap-4 rounded-container p-4 transition-colors ${
                          on
                            ? 'bg-foreground text-background'
                            : 'bg-muted hover:bg-surface-container-high'
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                            on ? 'bg-background/15' : 'bg-card'
                          }`}
                        >
                          <Icon size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span id={`signup-${key}-name`} className="block text-15 font-bold">
                            {t(`emailPreferences.${key}`, label)}
                          </span>
                          {meta && (
                            <span
                              id={`signup-${key}-hint`}
                              className={`block text-13 ${on ? 'text-background/70' : 'text-muted-foreground'}`}
                            >
                              {t(`emailUpdates.hint.${key}`, meta.hint)}
                            </span>
                          )}
                        </span>
                        <input
                          id={`signup-${key}`}
                          aria-labelledby={`signup-${key}-name`}
                          aria-describedby={meta ? `signup-${key}-hint` : undefined}
                          type="checkbox"
                          className="h-5 w-5 shrink-0 accent-current"
                          checked={on}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, key]
                                : selected.filter((t) => t !== key),
                            )
                          }
                        />
                      </label>
                    );
                  })}
                </fieldset>
                <div className="flex min-h-10 items-start gap-4">
                  <input
                    className="mt-1 h-5 w-5 shrink-0"
                    id="public-email-consent"
                    type="checkbox"
                    required
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <Label htmlFor="public-email-consent">
                    {t(
                      'emailUpdates.consent',
                      'I request the email updates selected above and understand I can unsubscribe at any time.',
                    )}
                  </Label>
                </div>
              </>
            ) : (
              <p className="text-sm">
                {t(
                  'emailUpdates.manageHelp',
                  'Request a private, single-use link to change topics or unsubscribe. A link cannot reactivate an unsubscribed mailbox. You do not need an account.',
                )}
              </p>
            )}
            <TurnstileWidget
              siteKey={emailSiteKey}
              key={mode}
              ref={challenge}
              action={mode === 'manage' ? 'email-manage' : 'email-subscribe'}
              onVerify={setProof}
              onExpire={() => setProof('')}
            />
            {!verificationEnabled && (
              <p role="status" className="text-sm">
                {t(
                  'emailUpdates.unconfigured',
                  'Email verification is not configured on this page. Public requests are unavailable.',
                )}
              </p>
            )}
            <Button
              className="w-full"
              disabled={
                !verificationEnabled ||
                !proof ||
                (mode === 'subscribe' && (!consent || !selected.length))
              }
            >
              {busy
                ? t('emailUpdates.working', 'Requesting…')
                : mode === 'manage'
                  ? t('emailUpdates.requestLink', 'Request a private link')
                  : t('emailUpdates.requestConfirmation', 'Request confirmation email')}
            </Button>
          </fieldset>
          {notice && (
            <p role="status" className="rounded-container bg-muted p-4">
              {notice}
            </p>
          )}
          {error && <p role="alert">{error}</p>}
        </form>
      </div>
    </PageContainer>
  );
}
