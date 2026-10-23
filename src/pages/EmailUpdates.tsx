import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    <PageContainer size="form" className="space-y-8">
      <header className="space-y-4">
        <h1 className="font-sans text-display font-bold">
          {t('emailUpdates.title', 'Email updates')}
        </h1>
        <p>
          {t(
            'emailUpdates.availability',
            'Newsletter delivery is not available yet. You can confirm a subscription and save the updates you want to receive when it becomes available.',
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          {t(
            'emailUpdates.separation',
            'These subscriptions are separate from account messages and the activity emails you control in account settings.',
          )}
        </p>
      </header>
      <div className="flex flex-wrap gap-2" aria-label="Email update action">
        <Button
          variant={mode === 'subscribe' ? 'default' : 'outline'}
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
          variant={mode === 'manage' ? 'default' : 'outline'}
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
              <fieldset className="space-y-4">
                <legend className="mb-4 font-semibold">
                  {t('emailUpdates.choose', 'Choose your updates')}
                </legend>
                {topics.map(([key, label]) => (
                  <div key={key} className="flex min-h-10 items-center gap-4">
                    <input
                      id={`signup-${key}`}
                      type="checkbox"
                      checked={selected.includes(key)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? [...selected, key] : selected.filter((t) => t !== key),
                        )
                      }
                    />
                    <Label htmlFor={`signup-${key}`}>{t(`emailPreferences.${key}`, label)}</Label>
                  </div>
                ))}
              </fieldset>
              <div className="flex min-h-10 items-center gap-4">
                <input
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
          <p role="status" className="border border-border p-4">
            {notice}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </form>
    </PageContainer>
  );
}
