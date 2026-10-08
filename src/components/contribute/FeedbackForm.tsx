import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, Check, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { insertRow } from '@/hooks/usePageFetchers';
import { uploadImageToR2 } from '@/lib/uploadImageToR2';
import { captureContext } from '@/utils/feedbackContext';
import { feedbackCategories } from '@/config/feedbackCategories';

interface FeedbackFormProps {
  screenshotBlob?: Blob | null;
  onCancel?: () => void;
  onDone?: () => void;
}

const EMPTY_FORM = { category: '', title: '', description: '', email: '', honeypot: '' };

export default function FeedbackForm({ screenshotBlob, onCancel, onDone }: FeedbackFormProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'submitted'>('idle');
  const [includeScreenshot, setIncludeScreenshot] = useState(Boolean(user && screenshotBlob));
  // The preview only renders for signed-in users (anonymous feedback never
  // uploads a screenshot), so an anonymous visitor gets no object URL at all.
  const canAttachScreenshot = Boolean(user && screenshotBlob);
  const screenshotUrl = useMemo(
    () => (canAttachScreenshot && screenshotBlob ? URL.createObjectURL(screenshotBlob) : null),
    [canAttachScreenshot, screenshotBlob],
  );

  useEffect(
    () => () => {
      if (screenshotUrl) URL.revokeObjectURL(screenshotUrl);
    },
    [screenshotUrl],
  );

  const submit = useCallback(async () => {
    if (form.honeypot) return;
    if (!form.category || !form.title.trim() || !form.description.trim()) return;

    setStatus('submitting');
    try {
      let uploadedScreenshot: string | null = null;
      if (user && includeScreenshot && screenshotBlob) {
        // A screenshot is useful context, never a reason to lose the feedback.
        // The upload endpoint can fail independently of the anonymous-friendly
        // community_submissions insert, so preserve the previous best-effort
        // behaviour for signed-in users.
        try {
          uploadedScreenshot = await uploadImageToR2(screenshotBlob, 'feedback-screenshots');
        } catch {
          uploadedScreenshot = null;
        }
      }

      const { error } = await insertRow('community_submissions', {
        content_type: 'feedback',
        data: {
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category,
          contact_email: form.email.trim() || null,
          context: captureContext(),
          screenshot_url: uploadedScreenshot,
        },
        submitted_by: user?.id ?? null,
      });
      if (error) throw error;

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
  }, [form, includeScreenshot, screenshotBlob, t, toast, user]);

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
      <fieldset className="mb-6 border-0 p-0">
        <legend className="text-sm font-semibold">
          {t('contribute.feedback.category', 'What type of feedback?')}
        </legend>
        <div className="mt-4 grid grid-cols-2 gap-4">
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
                className={`flex min-h-12 items-center gap-2 rounded-element px-3 py-2.5 text-left text-sm font-medium shadow-soft transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
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

      <div className="mb-6">
        <Label htmlFor="feedback-title">{t('contribute.feedback.title', 'Title')} *</Label>
        <Input
          id="feedback-title"
          className="mt-1"
          value={form.title}
          maxLength={200}
          placeholder={t('contribute.feedback.titlePlaceholder', 'Brief summary')}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
        />
      </div>

      <div className="mb-6">
        <Label htmlFor="feedback-description">
          {t('contribute.feedback.description', 'Description')} *
        </Label>
        <Textarea
          id="feedback-description"
          className="mt-1 min-h-28"
          value={form.description}
          placeholder={t('contribute.feedback.descriptionPlaceholder', 'Tell us more…')}
          onChange={(event) =>
            setForm((current) => ({ ...current, description: event.target.value }))
          }
        />
      </div>

      {!user && (
        <div className="mb-6">
          <Label htmlFor="feedback-email">
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

      {user && screenshotBlob && (
        <div className="mb-6 rounded-container bg-card p-4 shadow-soft">
          <div className="flex items-center gap-2">
            <Checkbox
              id="feedback-screenshot"
              checked={includeScreenshot}
              onCheckedChange={(checked) => setIncludeScreenshot(checked === true)}
            />
            <Label
              htmlFor="feedback-screenshot"
              className="flex cursor-pointer items-center gap-1.5"
            >
              <Camera size={14} />
              {t('contribute.feedback.includeScreenshot', 'Include screenshot of this page')}
            </Label>
          </div>
          {includeScreenshot && screenshotUrl && (
            <img
              src={screenshotUrl}
              alt={t('contribute.feedback.screenshotPreview', 'Screenshot preview')}
              className="ml-8 mt-2 max-w-56 rounded-element bg-muted"
            />
          )}
        </div>
      )}

      <div className="mb-6 flex items-start gap-4 rounded-container bg-surface-container-high p-4 text-xs leading-relaxed text-muted-foreground">
        <Info size={16} className="mt-0.5 shrink-0 text-foreground" aria-hidden="true" />
        <span>
          {t(
            'contribute.feedback.contextNote',
            'Automatically included: current page URL, browser information and recent errors.',
          )}
        </span>
      </div>

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

      <div className="sticky bottom-0 -mx-1 flex justify-end gap-4 bg-surface-container-low/95 px-1 pt-4 max-sm:flex-col-reverse sm:items-center">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="max-sm:w-full">
            {t('contribute.common.back', 'Back')}
          </Button>
        )}
        <Button
          type="submit"
          className="max-sm:w-full"
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
