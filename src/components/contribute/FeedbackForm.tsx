import { useCallback, useState } from 'react';
import { Check } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { captureContext } from '@/utils/feedbackContext';
import { feedbackCategories } from '@/config/feedbackCategories';
import { submitCommunityReport } from '@/lib/submitCommunityReport';
import { ReportContextPanel } from './ReportContextPanel';

interface FeedbackFormProps {
  initialCategory?: string;
  screenshotBlob?: Blob | null;
  onCancel?: () => void;
  onDone?: () => void;
  /** Tighter layout for the Hub menu: small category chips, short boxes. */
  compact?: boolean;
}

const EMPTY_FORM = { category: '', title: '', description: '', email: '', honeypot: '' };

export default function FeedbackForm({
  initialCategory,
  screenshotBlob,
  onCancel,
  onDone,
  compact = false,
}: FeedbackFormProps) {
  const gap = compact ? 'mb-2.5' : 'mb-6';
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const requestedCategory =
    initialCategory ?? new URLSearchParams(window.location.search).get('category') ?? '';
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    category: feedbackCategories.some((category) => category.value === requestedCategory)
      ? requestedCategory
      : '',
  }));
  const [status, setStatus] = useState<'idle' | 'submitting' | 'submitted'>('idle');
  const [includeScreenshot, setIncludeScreenshot] = useState(Boolean(screenshotBlob));

  const submit = useCallback(async () => {
    if (form.honeypot) return;
    if (!form.category || !form.title.trim() || !form.description.trim()) return;

    setStatus('submitting');
    try {
      await submitCommunityReport({
        kind: 'feedback',
        payload: {
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category,
          contact_email: form.email.trim() || null,
        },
        context: captureContext(),
        screenshotBlob,
        includeScreenshot,
        honeypot: form.honeypot,
      });

      setStatus('submitted');
      setForm(EMPTY_FORM);
      toast({ title: t('contribute.feedback.successToast', 'Feedback submitted. Thank you!') });
    } catch (error) {
      setStatus('idle');
      toast({
        title: t('contribute.common.failed', 'Submission failed'),
        description:
          error instanceof Error
            ? error.message
            : t('contribute.common.tryAgain', 'Please try again.'),
        variant: 'destructive',
      });
    }
  }, [form, includeScreenshot, screenshotBlob, t, toast]);

  if (status === 'submitted') {
    return (
      <div className="rounded-container bg-card px-6 py-10 text-center shadow-soft">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-track-ring bg-track-pink text-track-ring">
          <Check size={24} />
        </div>
        <h2 className="text-title font-bold">{t('contribute.feedback.thanks', 'Thank you!')}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {t('contribute.feedback.successBody', 'Your feedback helps improve Queer Guide.')}
        </p>
        <Button className="mt-6" onClick={onDone}>
          {t('contribute.common.done', 'Done')}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <fieldset className={cn(gap, 'border-0 p-0')}>
        <legend className={compact ? 'sr-only' : 'text-sm font-semibold'}>
          {t('contribute.feedback.category', 'What type of feedback?')}
        </legend>
        <div
          className={
            compact ? 'flex flex-wrap gap-1.5' : 'mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5'
          }
        >
          {feedbackCategories.map((category) => {
            const Icon = category.icon;
            const selected = form.category === category.value;
            return (
              <button
                key={category.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setForm((current) => ({ ...current, category: category.value }))}
                className={`flex items-center gap-2 rounded-element text-left font-medium transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  compact
                    ? 'min-h-9 px-2.5 py-1.5 text-13'
                    : 'min-h-12 px-4 py-2.5 text-sm shadow-soft'
                } ${
                  selected
                    ? 'bg-foreground text-background'
                    : 'bg-card text-foreground hover:-translate-y-0.5 hover:bg-surface-container-low hover:shadow-soft-hover'
                }`}
              >
                <Icon size={16} aria-hidden="true" />
                {t(`contribute.feedback.categories.${category.value}`, category.label)}
              </button>
            );
          })}
        </div>
      </fieldset>

      {form.category === 'safety' && (
        <p
          className={cn(
            gap,
            'rounded-element bg-surface-container-high p-4 text-sm leading-relaxed',
          )}
        >
          {t('contact.form.safetyNote', 'If you are in danger right now, this is the slow route.')}{' '}
          <LocalizedLink to="/help">
            {t('contact.form.safetyLink', 'Crisis lines by country')}
          </LocalizedLink>
          .
        </p>
      )}

      <div className={gap}>
        <Label htmlFor="feedback-title" className={compact ? 'sr-only' : undefined}>
          {t('contribute.feedback.title', 'Title')} *
        </Label>
        <Input
          id="feedback-title"
          className="mt-1"
          value={form.title}
          maxLength={200}
          placeholder={t('contribute.feedback.titlePlaceholder', 'Brief summary')}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
        />
      </div>

      <div className={gap}>
        <Label htmlFor="feedback-description" className={compact ? 'sr-only' : undefined}>
          {t('contribute.feedback.description', 'Description')} *
        </Label>
        <Textarea
          id="feedback-description"
          className={cn('mt-1', compact ? 'min-h-16' : 'min-h-28')}
          value={form.description}
          placeholder={t('contribute.feedback.descriptionPlaceholder', 'Tell us more…')}
          onChange={(event) =>
            setForm((current) => ({ ...current, description: event.target.value }))
          }
        />
      </div>

      {!user && (
        <div className={gap}>
          <Label htmlFor="feedback-email" className={compact ? 'sr-only' : undefined}>
            {t('contribute.common.emailOptional', 'Email (optional)')}
          </Label>
          <Input
            id="feedback-email"
            type="email"
            className="mt-1"
            value={form.email}
            placeholder={t('contribute.common.emailPlaceholder', 'So we can follow up')}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          />
        </div>
      )}

      <ReportContextPanel
        id="feedback-screenshot"
        compact={compact}
        screenshotBlob={screenshotBlob}
        includeScreenshot={includeScreenshot}
        onIncludeScreenshotChange={setIncludeScreenshot}
      />

      <input
        type="text"
        name="website"
        value={form.honeypot}
        onChange={(event) => setForm((current) => ({ ...current, honeypot: event.target.value }))}
        className="absolute -left-[9999px] h-0 opacity-0"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />

      <div
        className={
          compact
            ? 'flex items-center justify-end gap-2'
            : 'mt-6 flex justify-end gap-4 border-t border-border-hairline pt-6 max-sm:flex-col-reverse sm:items-center'
        }
      >
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            size={compact ? 'sm' : undefined}
            onClick={onCancel}
            className={compact ? undefined : 'max-sm:w-full'}
          >
            {t('contribute.common.back', 'Back')}
          </Button>
        )}
        <Button
          type="submit"
          size={compact ? 'sm' : undefined}
          className={compact ? undefined : 'max-sm:w-full'}
          disabled={
            status === 'submitting' ||
            !form.category ||
            !form.title.trim() ||
            !form.description.trim()
          }
        >
          {status === 'submitting'
            ? t('contribute.common.submitting', 'Submitting…')
            : t('contribute.common.submit', 'Submit')}
        </Button>
      </div>
    </form>
  );
}
