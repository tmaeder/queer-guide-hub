import { useId, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { PageContainer } from '@/components/layout/PageContainer';
import { SidebarCard, SidebarRow } from '@/components/transit/SidebarCard';
import { TransitIcon } from '@/components/transit/TransitIcon';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { ArrowRight, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

/**
 * /contact, drawn as a departure board.
 *
 * The old page was one form under a decorative photo, with a `<Select>` hiding
 * the routing model and a five-question FAQ that had drifted into fiction (it
 * told readers to click an "Add Venue" button that does not exist and to apply
 * to an ambassador programme that never did). Both are replaced by the thing
 * the page is actually for: saying where a message goes.
 *
 * Three rules shaped it.
 *
 * 1. **The lines are the control.** Category was a dropdown, so the routing
 *    model — the only real content on a contact page — was invisible until you
 *    opened it. It is now a radiogroup of cards that each say where that line
 *    terminates. The stored `value`s are unchanged (`support` / `safety` /
 *    `partnerships` / `bugs` / `other`), so `?category=` deep links and the
 *    `contact-form` edge function's payload are untouched.
 *
 * 2. **Some lines do not stop here.** Crisis support, submissions, feature
 *    voting, security disclosure and legal each have a real destination
 *    elsewhere in the product, and routing them through a form that emails
 *    support@ is worse than saying so. `security@queer.guide` is the only
 *    address printed, because SECURITY.md already publishes it and a
 *    vulnerability report must not go through a generic queue.
 *
 * 3. **No track colours, no photo.** The footer's "Report something" link
 *    lands here (`/contact?category=safety`), so this is a safety-adjacent
 *    surface: hue may not carry weight where a reader is making a risk
 *    judgement. Weight comes from ink inversion and rules, per
 *    docs/design-system/README.md § Crisis surfaces. The 400px Wikimedia hero
 *    the page used to carry rendered as an empty grey plate on prod and pushed
 *    the form below the fold; it was decoration, so it is gone.
 *
 * Nothing here claims a response time. The only one we can honour is the 72
 * hours SECURITY.md commits to for security reports, so that is the only one
 * quoted. Inventing an SLA for the form would be a promise nobody wrote down.
 */

/** A line that stops here. `value` is the stored `category` — do not rename. */
const LINES: { value: string; icon: TransitIconName; label: string; goes: string }[] = [
  {
    value: 'support',
    icon: 'info-point',
    label: 'Support',
    goes: 'Your account, a listing, something on the site you cannot find.',
  },
  {
    value: 'safety',
    icon: 'alerts',
    label: 'Safety and moderation',
    goes: 'Harassment, a dangerous or wrong listing, someone’s behaviour.',
  },
  {
    value: 'partnerships',
    icon: 'community',
    label: 'Partnerships',
    goes: 'Press, venues, organisations, sponsorship.',
  },
  {
    value: 'bugs',
    icon: 'tune',
    label: 'Bug reports',
    goes: 'Something is broken, or a page shows the wrong thing.',
  },
  {
    value: 'other',
    icon: 'chat',
    label: 'Something else',
    goes: 'Anything the four lines above do not cover.',
  },
];

/**
 * Lines that terminate somewhere else in the product.
 *
 * `/help` is deliberately NOT one of them. It has the ink band above instead,
 * because a crisis route listed as one of five equals reads as equal to the
 * legal hub, and it is not. One loud band plus the contextual repeat on the
 * safety line beats a fifth row here.
 */
const ELSEWHERE: {
  key: string;
  icon: TransitIconName;
  title: string;
  body: string;
  to?: string;
  href?: string;
  cta: string;
}[] = [
  {
    key: 'submit',
    icon: 'add-station',
    title: 'Add a venue, event or place',
    body: 'Submissions go through the review queue before they appear. The form here does not.',
    to: '/submit',
    cta: 'Submit something',
  },
  {
    key: 'feedback',
    icon: 'compass',
    title: 'Feature ideas, and bugs other people hit too',
    body: 'The public board. Check whether it is already reported, and vote on what ships next.',
    to: '/feedback',
    cta: 'Feedback board',
  },
  {
    key: 'security',
    icon: 'documents',
    title: 'A security vulnerability',
    body: 'Please do not file it publicly. Reports are acknowledged within 72 hours.',
    href: 'mailto:security@queer.guide',
    cta: 'security@queer.guide',
  },
  {
    key: 'legal',
    icon: 'library',
    title: 'Legal, privacy or a takedown',
    body: 'Policies, data requests and the DMCA process all live in the legal hub.',
    to: '/legal',
    cta: 'Legal hub',
  },
];

/** Mirrors the server guard in `supabase/functions/contact-form`. Validating the
 *  same three rules here is what turns a raw 400 toast into a field message. */
const MIN_MESSAGE = 10;
const MIN_NAME = 2;

export default function Contact() {
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
    // `?category=` deep link. The footer's "Report something" is the caller
    // that needs it: reporting there is target-less, so the least this page can
    // do is arrive with the safety line already picked instead of asking a
    // reporter to find it. Validated against the vocabulary rather than
    // trusted — an unknown value leaves the field unset, never selects a line
    // that does not exist and then silently fails the submit guard.
    category: LINES.some((l) => l.value === searchParams.get('category'))
      ? (searchParams.get('category') as string)
      : '',
    message: '',
  });

  const [form, setForm] = useState(blankForm);

  const nameOk = form.name.trim().length >= MIN_NAME;
  const emailOk = form.email.includes('@') && form.email.trim().length > 2;
  const messageOk = form.message.trim().length >= MIN_MESSAGE;
  const ready = nameOk && emailOk && messageOk && form.category !== '';
  const selectedLine = LINES.find((l) => l.value === form.category);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      toast({
        title: t('contact.toast.errorTitle', 'Not sent'),
        description: message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {/* Masthead. No photo: the one this page carried was a decorative
          Wikimedia file that rendered as an empty plate and cost the form its
          place above the fold. */}
      {/* `flush` + an explicit top, never `className="pb-0"`: tailwind-merge
          drops the base `py-8` but leaves `md:py-12` standing (different
          modifier, different merge key), so the bottom padding silently
          returns at md and the masthead sits ~48px further from the band than
          the class says. Same trap as `px-0` against the gutter ladder. */}
      <PageContainer as="header" flush className="pt-8 md:pt-12">
        <Eyebrow variant="kicker" as="div">
          {t('contact.eyebrow', 'Contact')}
        </Eyebrow>
        {/* Rank table: page h1 is `--text-hero`, and `--text-hero-xl` is
            reserved for marketing covers. Stepping up from `display` on mobile
            keeps 76px off a 390px screen while landing the h1 on its own rank
            at md, one clear rung above the `headline md:display` section h2s. */}
        <h1 className="mt-6 text-display leading-[0.95] md:text-hero">
          {t('contact.title', 'Pick a line.')}
        </h1>
        <p className="mt-6 max-w-reading text-body-lg leading-relaxed text-muted-foreground">
          {t(
            'contact.lede',
            'Every message here is read by a person, not a ticket bot. Picking the right line only decides which person.',
          )}
        </p>
      </PageContainer>

      {/* Crisis routing. Ink, not red: nobody is harmed by failing to notice
          this strip, and `--destructive` is rationed to danger to the reader
          (docs/design-system/README.md § Crisis surfaces). It sits above the
          form on purpose, because the footer's "Report something" link lands
          on this page and a person in crisis should not have to read a form
          first. */}
      <div className="mt-10 bg-foreground text-background md:mt-16">
        <PageContainer className="py-8 md:py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-8">
            <div className="flex items-start gap-4">
              <TransitIcon name="helpline" size={32} className="mt-2 shrink-0" />
              <div>
                <p className="text-title font-bold leading-tight">
                  {t('contact.crisis.title', 'In a crisis, do not use this form.')}
                </p>
                <p className="mt-2 max-w-reading text-15 leading-relaxed text-background/80">
                  {t(
                    'contact.crisis.body',
                    'It is not watched around the clock. Crisis lines are, and they are listed by country, one click from any page.',
                  )}
                </p>
              </div>
            </div>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="shrink-0 bg-transparent text-background hover:bg-background hover:text-foreground"
            >
              <LocalizedLink to="/help" className="no-underline">
                {t('contact.crisis.cta', 'Crisis lines')}
              </LocalizedLink>
            </Button>
          </div>
        </PageContainer>
      </div>

      {/* The board. Lines are the category control: a dropdown hid the only
          real content this page has. */}
      <PageContainer as="section" flush className="pt-12 md:pt-16">
        <SectionHeader
          id={linesLabelId}
          eyebrow={t('contact.lines.eyebrow', 'Lines that stop here')}
          title={t('contact.lines.title', 'Where should this go?')}
          subtitle={t(
            'contact.lines.subtitle',
            'Pick one, then write. It routes your message and nothing else.',
          )}
        />

        <div
          role="radiogroup"
          aria-labelledby={linesLabelId}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {LINES.map((line) => {
            const active = form.category === line.value;
            return (
              <button
                key={line.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setForm((f) => ({ ...f, category: line.value }))}
                className={cn(
                  'flex h-full flex-col items-start gap-2 rounded-container p-6 text-left transition-colors duration-fast',
                  active ? 'bg-foreground text-background' : 'bg-card shadow-soft hover:bg-muted',
                )}
              >
                <span className="flex w-full items-start justify-between gap-4">
                  <TransitIcon name={line.icon} size={28} className="shrink-0" />
                  {/* Colour is never the only cue (WCAG 1.4.1): the selected
                      line carries a check as well as the ink flood. */}
                  <Check
                    size={18}
                    aria-hidden="true"
                    className={cn('shrink-0', active ? 'opacity-100' : 'opacity-0')}
                  />
                </span>
                <span className="text-title font-bold leading-tight">
                  {t(`contact.line.${line.value}.label`, line.label)}
                </span>
                <span
                  className={cn(
                    'text-13 leading-relaxed',
                    active ? 'text-background/75' : 'text-muted-foreground',
                  )}
                >
                  {t(`contact.line.${line.value}.goes`, line.goes)}
                </span>
              </button>
            );
          })}
        </div>
      </PageContainer>

      {/* Form plus rail. The rail is what the old page had no room for: what
          actually happens to the message, stated rather than implied. */}
      <PageContainer as="section" flush className="pb-16 pt-12 md:pb-24 md:pt-16">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-10">
          <div className="lg:col-span-2">
            {submitted ? (
              <div className="rounded-panel bg-card p-8 shadow-soft md:p-10">
                <TransitIcon name="chat" size={36} />
                <h2 className="mt-6 text-headline leading-tight">
                  {t('contact.sent.title', 'Sent.')}
                </h2>
                <p className="mt-4 max-w-reading text-15 leading-relaxed text-muted-foreground">
                  {t(
                    'contact.sent.body',
                    'It is in the team inbox with the line you picked. Replies come to the address you gave.',
                  )}
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSubmitted(false);
                      setForm(blankForm());
                    }}
                  >
                    {t('contact.sent.again', 'Send another')}
                  </Button>
                  <Button asChild variant="ghost">
                    <LocalizedLink to="/" className="no-underline">
                      {t('contact.sent.home', 'Back to the map')}
                    </LocalizedLink>
                  </Button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                noValidate
                className="rounded-panel bg-card p-6 shadow-soft md:p-8"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <h2 className="text-headline leading-tight">
                    {t('contact.form.title', 'Write it.')}
                  </h2>
                  <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
                    {selectedLine
                      ? t('contact.form.lineChosen', 'Line: {{line}}', {
                          line: t(`contact.line.${selectedLine.value}.label`, selectedLine.label),
                        })
                      : t('contact.form.linePending', 'No line picked yet')}
                  </p>
                </div>

                {/* The safety line is the one the footer sends people to, so it
                    repeats the crisis route where the reporter's eyes already
                    are rather than trusting them to scroll back up. */}
                {form.category === 'safety' && (
                  <p className="mt-6 rounded-element bg-muted p-4 text-13 leading-relaxed">
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

                <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="contact-name">{t('contact.form.name', 'Name')}</Label>
                    <Input
                      id="contact-name"
                      autoComplete="name"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="contact-email">{t('contact.form.email', 'Email')}</Label>
                    <Input
                      id="contact-email"
                      type="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      aria-describedby="contact-email-hint"
                    />
                    <p id="contact-email-hint" className="text-2xs text-muted-foreground">
                      {t('contact.form.emailHint', 'The only place a reply can go.')}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-2">
                  <Label htmlFor="contact-message">{t('contact.form.message', 'Message')}</Label>
                  <Textarea
                    id="contact-message"
                    value={form.message}
                    onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                    className="min-h-[160px]"
                    aria-describedby="contact-message-hint"
                  />
                  {/* States the server's own minimum instead of letting it come
                      back as a raw 400 in a toast. */}
                  <p id="contact-message-hint" className="text-2xs text-muted-foreground">
                    {messageOk
                      ? t('contact.form.messageOk', 'Long enough. Detail helps.')
                      : t('contact.form.messageMin', 'At least {{n}} characters.', {
                          n: MIN_MESSAGE,
                        })}
                  </p>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <Button type="submit" size="lg" loading={submitting} disabled={!ready}>
                    {t('contact.form.submit', 'Send message')}
                  </Button>
                  {!form.category && (
                    <p className="text-13 text-muted-foreground">
                      {t('contact.form.needLine', 'Pick a line above first.')}
                    </p>
                  )}
                </div>
              </form>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <SidebarCard
              eyebrow={t('contact.rail.next.eyebrow', 'What happens next')}
              title={t('contact.rail.next.title', 'No queue bot')}
            >
              {/* SidebarRow right-aligns its value in a narrow rail, so every
                  value here is a fragment, not a sentence. */}
              <SidebarRow
                label={t('contact.rail.next.readsLabel', 'Read by')}
                value={t('contact.rail.next.readsValue', 'A person')}
              />
              <SidebarRow
                label={t('contact.rail.next.storedLabel', 'Stored')}
                value={t('contact.rail.next.storedValue', 'Name, email, message')}
              />
              <SidebarRow
                label={t('contact.rail.next.limitLabel', 'Rate limit')}
                value={t('contact.rail.next.limitValue', '3 an hour, per address')}
              />
            </SidebarCard>

            <SidebarCard
              tone="ink"
              eyebrow={t('contact.rail.privacy.eyebrow', 'Before you send')}
              title={t('contact.rail.privacy.title', 'Say only what you need to')}
            >
              <p className="text-13 leading-relaxed text-background/80">
                {t(
                  'contact.rail.privacy.body',
                  'This is ordinary email at our end. If you are writing from somewhere being out is dangerous, leave out anything that would identify you beyond what the report needs.',
                )}
              </p>
              <p className="mt-4 text-13 leading-relaxed text-background/80">
                <LocalizedLink to="/privacy" className="text-background underline">
                  {t('contact.rail.privacy.link', 'How we handle your data')}
                </LocalizedLink>
              </p>
            </SidebarCard>
          </aside>
        </div>
      </PageContainer>

      {/* Replaces the FAQ. Every row here was one of its wrong answers: the old
          list told readers to click an "Add Venue" button that does not exist
          and to apply to an ambassador programme that never did. A link to the
          surface that actually does the job cannot drift the same way. */}
      <PageContainer as="section" flush className="pb-16 md:pb-24">
        <SectionHeader
          eyebrow={t('contact.elsewhere.eyebrow', 'Lines that terminate elsewhere')}
          title={t('contact.elsewhere.title', 'Not everything stops here.')}
          subtitle={t(
            'contact.elsewhere.subtitle',
            'These four have a faster route than the form.',
          )}
        />

        <ul className="m-0 flex list-none flex-col gap-0 p-0">
          {ELSEWHERE.map((row) => {
            const label = t(`contact.elsewhere.${row.key}.cta`, row.cta);
            return (
              <li key={row.key} className="border-b border-border-hairline last:border-b-0">
                <div className="flex flex-col gap-4 py-6 md:flex-row md:items-center md:gap-8">
                  <TransitIcon name={row.icon} size={28} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-title font-bold leading-tight">
                      {t(`contact.elsewhere.${row.key}.title`, row.title)}
                    </h3>
                    <p className="mt-2 max-w-reading text-13 leading-relaxed text-muted-foreground">
                      {t(`contact.elsewhere.${row.key}.body`, row.body)}
                    </p>
                  </div>
                  {row.to ? (
                    <LocalizedLink
                      to={row.to}
                      className="group inline-flex shrink-0 items-center gap-2 text-15 font-bold no-underline"
                    >
                      {label}
                      <ArrowRight
                        size={16}
                        aria-hidden="true"
                        className="transition-transform duration-fast group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1"
                      />
                    </LocalizedLink>
                  ) : (
                    <a
                      href={row.href}
                      className="inline-flex shrink-0 items-center gap-2 text-15 font-bold no-underline"
                    >
                      {label}
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </PageContainer>
    </div>
  );
}
