import { useState } from 'react';
import { Check, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { insertRow } from '@/hooks/usePageFetchers';
import { captureContext } from '@/utils/feedbackContext';
import { usePageEntityState } from '@/contexts/PageEntityContext';

interface CorrectionFormProps {
  onCancel?: () => void;
  onDone?: () => void;
}

export default function CorrectionForm({ onCancel, onDone }: CorrectionFormProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const entity = usePageEntityState();
  const [wrong, setWrong] = useState('');
  const [replacement, setReplacement] = useState('');
  const [email, setEmail] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'submitted'>('idle');

  const submit = async () => {
    if (honeypot || !wrong.trim() || !replacement.trim()) return;
    setStatus('submitting');
    try {
      const pageUrl = window.location.href;
      const { error } = await insertRow('community_submissions', {
        content_type: 'correction',
        data: {
          title: entity?.contentName
            ? `Correction: ${entity.contentName}`
            : `Correction for ${window.location.pathname}`,
          description: wrong.trim(),
          proposed_correction: replacement.trim(),
          contact_email: email.trim() || null,
          page_url: pageUrl,
          entity: entity
            ? {
                content_type: entity.contentType,
                content_id: entity.contentId,
                content_name: entity.contentName ?? null,
              }
            : null,
          context: captureContext(),
        },
        source_url: pageUrl,
        submitted_by: user?.id ?? null,
      });
      if (error) throw error;
      setStatus('submitted');
      toast({ title: t('contribute.correction.successToast', 'Correction submitted. Thank you!') });
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
  };

  if (status === 'submitted') {
    return (
      <div className="rounded-container bg-card px-6 py-10 text-center shadow-soft">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-track-ring bg-track-pink text-track-ring">
          <Check size={24} />
        </div>
        <h2 className="text-title font-bold">{t('contribute.correction.thanks', 'Thank you!')}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {t('contribute.correction.successBody', 'Our editors will review your correction.')}
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
      <div className="mb-6 flex items-start gap-4 rounded-container bg-card p-4 shadow-soft">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[3px] border-track-ring bg-background">
          <MapPin size={16} aria-hidden="true" />
        </span>
        <span className="min-w-0 pt-0.5">
          <span className="block text-sm font-bold">
            {entity?.contentName ?? t('contribute.correction.thisPage', 'This page')}
          </span>
          <span className="mt-1 block truncate text-xs text-muted-foreground">
            {window.location.href}
          </span>
        </span>
      </div>

      <div className="mb-6">
        <Label htmlFor="correction-wrong">
          {t('contribute.correction.wrong', 'What is wrong?')} *
        </Label>
        <Textarea
          id="correction-wrong"
          className="mt-1 min-h-24"
          value={wrong}
          onChange={(event) => setWrong(event.target.value)}
        />
      </div>

      <div className="mb-6">
        <Label htmlFor="correction-replacement">
          {t('contribute.correction.replacement', 'What should it say instead?')} *
        </Label>
        <Textarea
          id="correction-replacement"
          className="mt-1 min-h-24"
          value={replacement}
          onChange={(event) => setReplacement(event.target.value)}
        />
      </div>

      {!user && (
        <div className="mb-6">
          <Label htmlFor="correction-email">
            {t('contribute.common.emailOptional', 'Email (optional)')}
          </Label>
          <Input
            id="correction-email"
            type="email"
            className="mt-1"
            value={email}
            placeholder={t('contribute.common.emailPlaceholder', 'So we can follow up')}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
      )}

      <input
        type="text"
        name="website"
        value={honeypot}
        onChange={(event) => setHoneypot(event.target.value)}
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
          disabled={status === 'submitting' || !wrong.trim() || !replacement.trim()}
        >
          {status === 'submitting'
            ? t('contribute.common.submitting', 'Submitting…')
            : t('contribute.common.submit', 'Submit')}
        </Button>
      </div>
    </form>
  );
}
