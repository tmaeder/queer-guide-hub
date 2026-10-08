import { useId, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Bug,
  Check,
  CircleHelp,
  Handshake,
  MessageCircle,
  Scale,
  ShieldAlert,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ContactBranchProps {
  onBack?: () => void;
  onDone?: () => void;
}

interface ContactLine {
  value: string;
  icon: LucideIcon;
  label: string;
  goes: string;
}

const LINES: ContactLine[] = [
  {
    value: 'support',
    icon: CircleHelp,
    label: 'Support',
    goes: 'Your account, a listing, or something on the site you cannot find.',
  },
  {
    value: 'safety',
    icon: ShieldAlert,
    label: 'Safety and moderation',
    goes: 'Harassment, a dangerous listing, or someone’s behaviour.',
  },
  {
    value: 'partnerships',
    icon: Handshake,
    label: 'Partnerships',
    goes: 'Press, venues, organisations, or sponsorship.',
  },
  {
    value: 'bugs',
    icon: Bug,
    label: 'Bug reports',
    goes: 'Something is broken or a page shows the wrong thing.',
  },
  {
    value: 'other',
    icon: MessageCircle,
    label: 'Something else',
    goes: 'Anything the four lines above do not cover.',
  },
];

const MIN_MESSAGE = 10;
const MIN_NAME = 2;

export default function ContactBranch({ onBack, onDone }: ContactBranchProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const linesLabelId = useId();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const blankForm = () => ({
    name:
      (user?.user_metadata?.full_name as string | undefined) ??
      (user?.user_metadata?.name as string | undefined) ??
      '',
    email: user?.email ?? '',
    category: LINES.some((line) => line.value === searchParams.get('category'))
      ? (searchParams.get('category') as string)
      : '',
    message: '',
  });

  const [form, setForm] = useState(blankForm);
  const nameOk = form.name.trim().length >= MIN_NAME;
  const emailOk = form.email.includes('@') && form.email.trim().length > 2;
  const messageOk = form.message.trim().length >= MIN_MESSAGE;
  const ready = nameOk && emailOk && messageOk && form.category !== '';
  const selectedLine = LINES.find((line) => line.value === form.category);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('contact-form', { body: form });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setSubmitted(true);
      toast({
        title: t('contact.toast.sentTitle', 'Message sent'),
        description: t('contact.toast.sentBody', 'It is with a person now.'),
      });
    } catch (error: unknown) {
      toast({
        title: t('contact.toast.errorTitle', 'Not sent'),
        description:
          error instanceof Error
            ? error.message
            : t('contribute.common.tryAgain', 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-container bg-card px-6 py-10 text-center shadow-soft">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-track-ring bg-track-pink text-track-ring">
          <Check size={24} aria-hidden="true" />
        </div>
        <h2 className="text-title font-bold">{t('contact.sent.title', 'Sent.')}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {t(
            'contact.sent.body',
            'It is in the team inbox with the line you picked. Replies come to the address you gave.',
          )}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <Button
            variant="outline"
            onClick={() => {
              setSubmitted(false);
              setForm(blankForm());
            }}
          >
            {t('contact.sent.again', 'Send another')}
          </Button>
          <Button onClick={onDone}>{t('contribute.common.done', 'Done')}</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-8 flex flex-col gap-4 rounded-container bg-foreground p-6 text-background shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <ShieldAlert size={24} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-bold leading-tight">
              {t('contact.crisis.title', 'In a crisis, do not use this form.')}
            </p>
            <p className="mt-1 max-w-[58ch] text-sm leading-relaxed text-background/75">
              {t(
                'contact.crisis.body',
                'It is not watched around the clock. Crisis lines are listed by country.',
              )}
            </p>
          </div>
        </div>
        <Button
          asChild
          variant="outline"
          className="shrink-0 border-background/50 bg-transparent text-background hover:bg-background hover:text-foreground"
        >
          <LocalizedLink to="/help" className="no-underline">
            {t('contact.crisis.cta', 'Crisis lines')}
          </LocalizedLink>
        </Button>
      </div>

      <fieldset className="border-0 p-0">
        <legend id={linesLabelId} className="text-sm font-semibold">
          {t('contact.lines.title', 'Where should this go?')}
        </legend>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {t(
            'contact.lines.subtitle',
            'Pick one, then write. It routes your message and nothing else.',
          )}
        </p>
        <div
          role="radiogroup"
          aria-labelledby={linesLabelId}
          className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {LINES.map((line, index) => {
            const Icon = line.icon;
            const active = form.category === line.value;
            return (
              <button
                key={line.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setForm((current) => ({ ...current, category: line.value }))}
                className={cn(
                  'relative min-h-32 rounded-container p-6 text-left shadow-soft transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  index === LINES.length - 1 && 'sm:col-span-2 lg:col-span-2',
                  active
                    ? 'bg-foreground text-background'
                    : 'bg-card hover:-translate-y-0.5 hover:bg-surface-container-low hover:shadow-soft-hover',
                )}
              >
                <span className="flex items-start justify-between gap-4">
                  <Icon size={20} aria-hidden="true" />
                  <Check
                    size={18}
                    aria-hidden="true"
                    className={active ? 'opacity-100' : 'opacity-0'}
                  />
                </span>
                <span className="mt-4 block font-bold leading-tight">
                  {t(`contact.line.${line.value}.label`, line.label)}
                </span>
                <span
                  className={cn(
                    'mt-1.5 block text-xs leading-relaxed',
                    active ? 'text-background/75' : 'text-muted-foreground',
                  )}
                >
                  {t(`contact.line.${line.value}.goes`, line.goes)}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-8 rounded-container bg-card p-6 shadow-soft">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-title font-bold">{t('contact.form.title', 'Write it.')}</h2>
          <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
            {selectedLine
              ? t('contact.form.lineChosen', 'Line: {{line}}', {
                  line: t(`contact.line.${selectedLine.value}.label`, selectedLine.label),
                })
              : t('contact.form.linePending', 'No line picked yet')}
          </p>
        </div>

        {form.category === 'safety' && (
          <p className="mt-4 rounded-element bg-surface-container-high p-4 text-sm leading-relaxed">
            {t(
              'contact.form.safetyNote',
              'If you are in danger right now, this is the slow route.',
            )}{' '}
            <LocalizedLink to="/help">
              {t('contact.form.safetyLink', 'Crisis lines by country')}
            </LocalizedLink>
            .
          </p>
        )}

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <Label htmlFor="contact-name">{t('contact.form.name', 'Name')} *</Label>
            <Input
              id="contact-name"
              className="mt-1"
              autoComplete="name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="contact-email">{t('contact.form.email', 'Email')} *</Label>
            <Input
              id="contact-email"
              type="email"
              className="mt-1"
              autoComplete="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              aria-describedby="contact-email-hint"
            />
            <p id="contact-email-hint" className="mt-1.5 text-2xs text-muted-foreground">
              {t('contact.form.emailHint', 'The only place a reply can go.')}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <Label htmlFor="contact-message">{t('contact.form.message', 'Message')} *</Label>
          <Textarea
            id="contact-message"
            className="mt-1 min-h-36"
            value={form.message}
            onChange={(event) =>
              setForm((current) => ({ ...current, message: event.target.value }))
            }
            aria-describedby="contact-message-hint"
          />
          <p id="contact-message-hint" className="mt-1.5 text-2xs text-muted-foreground">
            {messageOk
              ? t('contact.form.messageOk', 'Long enough. Detail helps.')
              : t('contact.form.messageMin', 'At least {{n}} characters.', { n: MIN_MESSAGE })}
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-4 border-t border-border-hairline pt-4 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-[58ch] text-xs leading-relaxed text-muted-foreground">
            {t(
              'contact.rail.privacy.body',
              'This is ordinary email at our end. Say only what the message needs.',
            )}{' '}
            <LocalizedLink to="/privacy">
              {t('contact.rail.privacy.link', 'How we handle your data')}
            </LocalizedLink>
          </p>
          <div className="flex shrink-0 items-center gap-4 text-xs font-semibold">
            <LocalizedLink to="/legal" className="inline-flex items-center gap-1.5">
              <Scale size={14} aria-hidden="true" />
              {t('contact.elsewhere.legal.cta', 'Legal hub')}
            </LocalizedLink>
            <a href="mailto:security@queer.guide" className="inline-flex items-center gap-1.5">
              <ShieldCheck size={14} aria-hidden="true" />
              {t('contact.elsewhere.security.cta', 'Security')}
            </a>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-4 max-sm:flex-col-reverse sm:items-center">
        {onBack && (
          <Button type="button" variant="outline" onClick={onBack} className="max-sm:w-full">
            {t('contribute.common.back', 'Back')}
          </Button>
        )}
        <Button type="submit" className="max-sm:w-full" loading={submitting} disabled={!ready}>
          {t('contact.form.submit', 'Send message')}
          {!submitting && <ArrowRight size={16} aria-hidden="true" />}
        </Button>
      </div>
    </form>
  );
}
