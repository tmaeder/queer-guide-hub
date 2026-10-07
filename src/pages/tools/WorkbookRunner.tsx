/**
 * The workbook runner — /tools/workbook/:slug.
 *
 * WHY IT LIVES UNDER /tools AND NOT UNDER /tags
 *
 * The workbook's CONTENT is discovered on the glossary term (the TagWorkbooks
 * band), but working through it is a private, stateful task with partner
 * grants. /tools is already the namespace for exactly that: /tools/checklist
 * sits behind the same intimate opt-in, appears in no sitemap, and has no
 * `search_documents` row. Putting the runner beside it inherits all three
 * rather than re-arguing them on a public route.
 *
 * The eligibility gate below is the one from KinkChecklist, deliberately
 * unchanged: signed out -> sign in; signed in but not opted in -> onboarding.
 * A workbook answer is the same class of data as a kink rating and gets the
 * same door.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check, Lock, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { GlossaryLinkedProse } from '@/components/tags/GlossaryLinkedText';
import { useAuth } from '@/hooks/useAuth';
import { useMyIntimateProfile } from '@/hooks/useIntimateProfile';
import {
  useWorkbookBySlug,
  unlockedSteps,
  daysUntilUnlock,
  type WorkbookStep,
} from '@/hooks/useTagWorkbooks';
import {
  useMyWorkbookAnswers,
  useSaveWorkbookAnswer,
  useWorkbookProgress,
  useUpsertWorkbookProgress,
} from '@/hooks/useWorkbookAnswers';
import { WorkbookMenuStep } from '@/components/workbooks/WorkbookMenuStep';
import { WorkbookShareStep } from '@/components/workbooks/WorkbookShareStep';

/**
 * Debounced autosave for one prompt.
 *
 * `draft` is null until the reader types, so the field tracks the fetched
 * answer with NO effect and no syncing — which is both why there is no
 * setState-in-effect here and why a slow fetch cannot lose an answer. An
 * earlier version synced in an effect under `!value && stored`, and that is a
 * real bug as well as a lint warning: a reader who typed before the fetch
 * landed would never see their stored answer adopted.
 *
 * MOUNTED PER STEP (`key={step.id}` at the call site), so moving between steps
 * resets the draft by construction rather than by comparing refs.
 */
function PromptStep({ step }: { step: WorkbookStep }) {
  const { t } = useTranslation();
  const { data: answers } = useMyWorkbookAnswers([step.id]);
  const save = useSaveWorkbookAnswer();
  const stored = answers?.get(step.id)?.body ?? '';
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? stored;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onChange = (next: string) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      save.mutate({ step_id: step.id, body: next });
    }, 800);
  };

  return (
    <div>
      {step.prompt_md && (
        <h3 className="font-display text-headline leading-tight">{step.prompt_md}</h3>
      )}
      {step.help_md && <p className="mt-2 text-sm text-muted-foreground">{step.help_md}</p>}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={step.answer_max_len}
        rows={7}
        className="mt-4 rounded-element"
        placeholder={t('workbooks.answerPlaceholder', 'Your answer, saved as you type')}
        aria-label={step.prompt_md ?? t('workbooks.answer', 'Your answer')}
      />
      <p className="mt-2 text-2xs uppercase tracking-label text-muted-foreground">
        {t('workbooks.privateNote', 'Private to you until you choose to share it')}
      </p>
    </div>
  );
}

export default function WorkbookRunner() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { data: me, isLoading: meLoading } = useMyIntimateProfile();
  const { data: workbook, isLoading } = useWorkbookBySlug(slug);
  const { data: progress } = useWorkbookProgress(workbook?.id);
  const upsertProgress = useUpsertWorkbookProgress();

  const [index, setIndex] = useState(0);
  const [shareStep, setShareStep] = useState(false);

  // Memoised because `?? []` mints a new array every render, which would make
  // the `available` memo below recompute on each one.
  const steps = useMemo(() => workbook?.steps ?? [], [workbook?.steps]);
  const available = useMemo(
    () => unlockedSteps(steps, progress?.started_at ?? null),
    [steps, progress?.started_at],
  );
  const lockedCount = steps.length - available.length;

  // Stamp started_at on first arrival. A program's day pacing reads this one
  // timestamp, so it must exist before day 0 can be judged unlocked.
  const started = useRef(false);
  useEffect(() => {
    if (!workbook || !user || !me?.opted_in_at || progress || started.current) return;
    started.current = true;
    upsertProgress.mutate({ workbook_id: workbook.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workbook?.id, user?.id, me?.opted_in_at, progress]);

  if (loading || meLoading || isLoading) {
    return (
      <PageContainer size="form">
        <PageLoadingState count={2} variant="list" label="Loading workbook" />
      </PageContainer>
    );
  }

  if (!workbook) {
    return (
      <PageContainer size="form" className="text-center">
        <h1 className="font-display text-headline">
          {t('workbooks.notFound', 'Workbook not found')}
        </h1>
        <Button className="mt-6 rounded-element" onClick={() => navigate('/tags')}>
          {t('workbooks.backToGlossary', 'Back to the glossary')}
        </Button>
      </PageContainer>
    );
  }

  // ── The gate, copied from KinkChecklist ────────────────────────────────────
  if (!user) {
    return (
      <PageContainer size="form" className="text-center">
        <h1 className="font-display text-headline">{workbook.title}</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {t(
            'workbooks.signInGate',
            'A private exercise for consenting adults. Sign in to work through it.',
          )}
        </p>
        <Button className="mt-6 rounded-element" onClick={() => navigate('/auth')}>
          {t('workbooks.signIn', 'Sign in')}
        </Button>
      </PageContainer>
    );
  }

  if (!me?.opted_in_at) {
    return (
      <PageContainer size="form" className="text-center">
        <h1 className="font-display text-headline">{workbook.title}</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {t(
            'workbooks.optInGate',
            'This is part of the intimate layer: 18+, opt-in, verified email. Everything you write is private by default, and nothing reaches a partner unless you share it and they reciprocate.',
          )}
        </p>
        <Button className="mt-6 rounded-element" onClick={() => navigate('/intimate/onboard')}>
          {t('workbooks.enableIntimate', 'Enable intimate profile')}
        </Button>
      </PageContainer>
    );
  }

  if (shareStep) {
    return (
      <PageContainer size="reading">
        <WorkbookShareStep workbook={workbook} onBack={() => setShareStep(false)} />
      </PageContainer>
    );
  }

  const clamped = Math.min(index, Math.max(available.length - 1, 0));
  const step = available[clamped];
  const pct = available.length ? Math.round((clamped / available.length) * 100) : 0;

  const advance = () => {
    if (clamped + 1 >= available.length) {
      upsertProgress.mutate({
        workbook_id: workbook.id,
        last_step_id: step?.id ?? null,
        completed: true,
      });
      if (workbook.requires_partner) setShareStep(true);
      return;
    }
    setIndex(clamped + 1);
    upsertProgress.mutate({ workbook_id: workbook.id, last_step_id: available[clamped + 1].id });
  };

  return (
    <PageContainer size="reading">
      <header className="mb-6">
        <LocalizedLink
          to={`/tags/${workbook.tag_slug}`}
          className="inline-flex items-center gap-1.5 text-13 text-muted-foreground no-underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {workbook.tag_name}
        </LocalizedLink>
        <h1 className="mt-2 font-display text-display leading-tight">{workbook.title}</h1>
        {workbook.dek && <p className="mt-2 text-sm text-muted-foreground">{workbook.dek}</p>}
      </header>

      {workbook.intro_md && clamped === 0 && (
        <GlossaryLinkedProse
          text={workbook.intro_md}
          className="qg-cms-body mb-8 rounded-container bg-surface-container p-6"
        />
      )}

      {step ? (
        <>
          <div className="mb-6 space-y-2">
            <div className="flex items-center justify-between text-13 text-muted-foreground">
              <span>{step.heading ?? t('workbooks.stepN', 'Step {{n}}', { n: clamped + 1 })}</span>
              <span>
                {clamped + 1} / {available.length}
              </span>
            </div>
            <Progress value={pct} className="h-1" />
          </div>

          <div className="rounded-container bg-surface-container p-6">
            {step.kind === 'prose' && (
              <>
                {step.heading && (
                  <h3 className="font-display text-headline leading-tight">{step.heading}</h3>
                )}
                <GlossaryLinkedProse text={step.prompt_md} className="qg-cms-body mt-4" />
              </>
            )}
            {/* key={step.id} is load-bearing: it remounts PromptStep per step,
                which is what resets its draft without an effect. Without it,
                moving to the next question carries the previous answer over. */}
            {(step.kind === 'prompt' || step.kind === 'checklist') && (
              <PromptStep key={step.id} step={step} />
            )}
            {step.kind === 'menu' && step.kink_category_slug && (
              <WorkbookMenuStep
                categorySlug={step.kink_category_slug}
                heading={step.heading}
                help={step.help_md}
              />
            )}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              className="rounded-element"
              disabled={clamped === 0}
              onClick={() => setIndex(Math.max(0, clamped - 1))}
            >
              {t('workbooks.back', 'Back')}
            </Button>
            <div className="flex gap-2">
              {workbook.requires_partner && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 rounded-element text-muted-foreground"
                  onClick={() => setShareStep(true)}
                >
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                  {t('workbooks.sharing', 'Sharing')}
                </Button>
              )}
              <Button size="sm" className="gap-1.5 rounded-element" onClick={advance}>
                {clamped + 1 >= available.length
                  ? t('workbooks.finish', 'Finish')
                  : t('workbooks.next', 'Next')}
                {clamped + 1 >= available.length ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('workbooks.noStepsYet', 'Nothing is available yet. Come back tomorrow.')}
        </p>
      )}

      {/* A locked day is stated rather than hidden: a four-day program that
          silently showed one step would read as a one-step workbook. */}
      {lockedCount > 0 && (
        <div className="mt-8 rounded-container border border-border-hairline p-6">
          <p className="inline-flex items-center gap-1.5 text-13 font-bold">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            {t('workbooks.lockedCount', '{{count}} still to come', { count: lockedCount })}
          </p>
          <ul className="mt-4 list-none space-y-2 p-0">
            {steps
              .filter((s) => !available.includes(s))
              .map((s) => {
                const days = daysUntilUnlock(s, progress?.started_at ?? null);
                return (
                  <li
                    key={s.id}
                    className="flex items-baseline justify-between gap-4 text-13 text-muted-foreground"
                  >
                    <span>{s.heading ?? s.key}</span>
                    <Badge variant="outline" className="rounded-badge text-2xs">
                      {days === 1
                        ? t('workbooks.inOneDay', 'tomorrow')
                        : t('workbooks.inNDays', 'in {{count}} days', { count: days })}
                    </Badge>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </PageContainer>
  );
}
