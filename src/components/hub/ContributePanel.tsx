import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  ArrowRight,
  Lightbulb,
  ListPlus,
  MessagesSquare,
  PencilLine,
  type LucideIcon,
} from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { submissionTypes } from '@/config/submissionRegistry';

const FeedbackForm = lazy(() => import('@/components/contribute/FeedbackForm'));
const CorrectionForm = lazy(() => import('@/components/contribute/CorrectionForm'));

type View = 'choose' | 'feedback' | 'correction' | 'add';

/**
 * The Hub menu's Contribute tab: the same four ways in as the Contribute
 * window. Reporting and fixing happen right here (the menu sits over the page,
 * so "this page" is still the page you were on); adding opens the type's
 * submission page; contacting the team opens /contact.
 */
export function ContributePanel({
  onNavigate,
  onFocusChange,
}: {
  onNavigate: () => void;
  /** True while a form is open, so the menu can hide its other chrome. */
  onFocusChange?: (focused: boolean) => void;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>('choose');
  const focused = view === 'feedback' || view === 'correction';
  useEffect(() => {
    onFocusChange?.(focused);
    return () => onFocusChange?.(false);
  }, [focused, onFocusChange]);
  const back = () => setView('choose');

  if (view !== 'choose') {
    const title =
      view === 'feedback'
        ? t('contribute.chooser.feedbackTitle', 'Report a problem or idea')
        : view === 'correction'
          ? t('contribute.chooser.correctionTitle', 'Fix something on this page')
          : t('contribute.chooser.addTitle', 'Add something new');
    return (
      <div className="flex w-full flex-col gap-2 px-2.5 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={back}
            aria-label={t('common.back', { defaultValue: 'Back' })}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-badge transition-colors hover:bg-surface-container-high"
          >
            <ArrowLeft size={16} aria-hidden />
          </button>
          <span className="min-w-0 flex-1 truncate text-13 font-bold">{title}</span>
        </div>
        {view === 'add' ? (
          <div className="grid grid-cols-4 gap-1.5">
            {submissionTypes.map((type) => {
              const Icon = type.icon;
              const label = t(`contributeForm.types.${type.id}`, type.label);
              return (
                <LocalizedLink
                  key={type.id}
                  to={`/submit/${type.id}`}
                  onClick={onNavigate}
                  title={label}
                  className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-element bg-card px-1 py-1.5 text-center no-underline transition-colors hover:bg-foreground hover:text-background"
                >
                  <Icon size={18} aria-hidden />
                  <span className="w-full truncate text-2xs font-bold leading-tight">{label}</span>
                </LocalizedLink>
              );
            })}
          </div>
        ) : (
          <Suspense
            fallback={
              <p className="px-4 py-6 text-center text-13 text-muted-foreground">
                {t('inbox.loading', { defaultValue: 'Loading…' })}
              </p>
            }
          >
            <div className="rounded-element bg-card p-2.5">
              {view === 'feedback' ? (
                <FeedbackForm compact onDone={back} />
              ) : (
                <CorrectionForm compact onDone={back} />
              )}
            </div>
          </Suspense>
        )}
      </div>
    );
  }

  const rows: Array<{
    icon: LucideIcon;
    title: string;
    body: string;
    view?: View;
    to?: string;
  }> = [
    {
      icon: Lightbulb,
      title: t('contribute.chooser.feedbackTitle', 'Report a problem or idea'),
      body: t(
        'contribute.chooser.feedbackBody',
        'Share feedback about the site or your experience.',
      ),
      view: 'feedback',
    },
    {
      icon: PencilLine,
      title: t('contribute.chooser.correctionTitle', 'Fix something on this page'),
      body: t(
        'contribute.chooser.correctionBody',
        'Tell us what is outdated, closed or incorrect.',
      ),
      view: 'correction',
    },
    {
      icon: ListPlus,
      title: t('contribute.chooser.addTitle', 'Add something new'),
      body: t('contribute.chooser.addBody', 'Submit a venue, event, product, person or article.'),
      view: 'add',
    },
    {
      icon: MessagesSquare,
      title: t('contribute.chooser.contactTitle', 'Contact the team'),
      body: t(
        'contribute.chooser.contactBody',
        'Account help, partnerships, press or another private message.',
      ),
      to: '/contact',
    },
  ];

  const rowClass =
    'flex min-h-11 w-full items-center gap-2.5 rounded-element px-2.5 py-1.5 text-left no-underline transition-colors hover:bg-surface-container-high';
  const rowBody = (row: (typeof rows)[number]) => (
    <>
      <row.icon size={16} aria-hidden className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{row.title}</span>
        <span className="block truncate text-13 text-muted-foreground">{row.body}</span>
      </span>
      <ArrowRight size={14} aria-hidden className="shrink-0 text-muted-foreground" />
    </>
  );

  return (
    <div className="flex flex-col gap-0.5 px-1.5 py-2">
      {rows.map((row) =>
        row.to ? (
          <LocalizedLink key={row.title} to={row.to} onClick={onNavigate} className={rowClass}>
            {rowBody(row)}
          </LocalizedLink>
        ) : (
          <button
            key={row.title}
            type="button"
            onClick={() => setView(row.view!)}
            className={rowClass}
          >
            {rowBody(row)}
          </button>
        ),
      )}
    </div>
  );
}
