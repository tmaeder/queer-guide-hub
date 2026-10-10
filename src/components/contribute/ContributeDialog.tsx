import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Lightbulb,
  ListPlus,
  LockKeyhole,
  MessagesSquare,
  PencilLine,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { useAuth } from '@/hooks/useAuth';

const FeedbackForm = lazy(() => import('./FeedbackForm'));
const CorrectionForm = lazy(() => import('./CorrectionForm'));
const AddSomethingBranch = lazy(() => import('./AddSomethingBranch'));
const ContactBranch = lazy(() => import('./ContactBranch'));

export type ContributeBranch = 'chooser' | 'feedback' | 'correction' | 'add' | 'contact';

interface ContributeDialogProps {
  mode?: 'dialog' | 'page';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialBranch?: ContributeBranch;
  initialType?: string;
  initialFeedbackCategory?: string;
  screenshotBlob?: Blob | null;
}

export function ContributeDialog({
  mode = 'dialog',
  open = true,
  onOpenChange,
  initialBranch = 'chooser',
  initialType,
  initialFeedbackCategory,
  screenshotBlob,
}: ContributeDialogProps) {
  const { t } = useTranslation();
  const [branch, setBranch] = useState<ContributeBranch>(initialBranch);
  const [activeType, setActiveType] = useState(initialType);
  const dialogContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode === 'dialog' && dialogContentRef.current) {
      dialogContentRef.current.scrollTop = 0;
    }
  }, [branch, mode]);

  const title =
    branch === 'feedback'
      ? t('contribute.feedback.heading', 'Report a problem or share an idea')
      : branch === 'correction'
        ? t('contribute.correction.heading', 'Fix something on this page')
        : branch === 'add'
          ? t('contribute.add.heading', 'Add something new')
          : branch === 'contact'
            ? t('contribute.chooser.contactTitle', 'Contact the team')
            : t('contribute.title', 'Contribute to Queer Guide');

  const description =
    branch === 'chooser'
      ? t(
          'contribute.subtitle',
          'Share what you noticed, correct a listing or help the guide grow.',
        )
      : branch === 'feedback'
        ? t('contribute.chooser.feedbackBody', 'Share feedback about the site or your experience.')
        : branch === 'correction'
          ? t('contribute.chooser.correctionBody', 'Tell us what is outdated, closed or incorrect.')
          : branch === 'add'
            ? t('contribute.chooser.addBody', 'Submit a venue, event, product, person or article.')
            : t(
                'contribute.chooser.contactBody',
                'Account help, partnerships, press or another private message.',
              );

  const close = () => {
    if (mode === 'page') setBranch('chooser');
    else onOpenChange?.(false);
  };
  const body = (
    <Suspense fallback={<PageLoadingState />}>
      <div
        key={branch}
        className="animate-in fade-in-0 slide-in-from-bottom-1 duration-fast motion-reduce:animate-none"
      >
        {branch === 'chooser' && <Chooser onChoose={setBranch} />}
        {branch === 'feedback' && (
          <FeedbackForm
            initialCategory={initialFeedbackCategory}
            screenshotBlob={screenshotBlob}
            onCancel={() => setBranch('chooser')}
            onDone={close}
          />
        )}
        {branch === 'correction' && (
          <CorrectionForm
            screenshotBlob={screenshotBlob}
            onCancel={() => setBranch('chooser')}
            onDone={close}
          />
        )}
        {branch === 'add' && (
          <AddSomethingBranch
            initialType={activeType}
            onBack={() => {
              setActiveType(undefined);
              setBranch('chooser');
            }}
          />
        )}
        {branch === 'contact' && (
          <ContactBranch onBack={() => setBranch('chooser')} onDone={close} />
        )}
      </div>
    </Suspense>
  );

  if (mode === 'page') {
    return (
      <PageContainer
        size={branch === 'add' || branch === 'contact' ? 'page' : 'reading'}
        className="md:py-16"
      >
        <section className="relative overflow-hidden rounded-panel bg-surface-container-low p-6 shadow-soft sm:p-8 md:p-10">
          <RouteSignal />
          <header className="mb-8 max-w-[42rem] pt-6 md:mb-10">
            <h1 className="text-display font-bold text-balance">{title}</h1>
            <p className="mt-4 max-w-[60ch] text-body-lg text-muted-foreground">{description}</p>
          </header>
          {body}
        </section>
      </PageContainer>
    );
  }

  const roomy = branch === 'add' || branch === 'contact';
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setBranch(initialBranch);
          setActiveType(initialType);
        }
        onOpenChange?.(nextOpen);
      }}
    >
      <DialogContent
        ref={dialogContentRef}
        className="max-h-[92vh] overflow-y-auto p-6 sm:p-8 max-sm:bottom-2 max-sm:left-2 max-sm:right-2 max-sm:top-auto max-sm:w-[calc(100%-1rem)] max-sm:translate-x-0 max-sm:translate-y-0"
        style={{ maxWidth: roomy ? 'min(1120px, calc(100vw - 2rem))' : 680 }}
      >
        <div className="pr-10">
          <RouteSignal />
        </div>
        <DialogHeader className="pr-10 text-left">
          <DialogTitle className="font-display text-headline leading-tight text-balance">
            {title}
          </DialogTitle>
          <p className="max-w-[58ch] text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function Chooser({ onChoose }: { onChoose: (branch: ContributeBranch) => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const choices: Array<{
    branch: Exclude<ContributeBranch, 'chooser'>;
    icon: LucideIcon;
    title: string;
    description: string;
  }> = [
    {
      branch: 'feedback',
      icon: Lightbulb,
      title: t('contribute.chooser.feedbackTitle', 'Report a problem or idea'),
      description: t(
        'contribute.chooser.feedbackBody',
        'Share feedback about the site or your experience.',
      ),
    },
    {
      branch: 'correction',
      icon: PencilLine,
      title: t('contribute.chooser.correctionTitle', 'Fix something on this page'),
      description: t(
        'contribute.chooser.correctionBody',
        'Tell us what is outdated, closed or incorrect.',
      ),
    },
    {
      branch: 'add',
      icon: ListPlus,
      title: t('contribute.chooser.addTitle', 'Add something new'),
      description: t(
        'contribute.chooser.addBody',
        'Submit a venue, event, product, person or article.',
      ),
    },
    {
      branch: 'contact',
      icon: MessagesSquare,
      title: t('contribute.chooser.contactTitle', 'Contact the team'),
      description: t(
        'contribute.chooser.contactBody',
        'Account help, partnerships, press or another private message.',
      ),
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {choices.map((choice) => {
        const Icon = choice.icon;
        const requiresAuth = choice.branch === 'add';
        return (
          <button
            key={choice.branch}
            type="button"
            onClick={() => onChoose(choice.branch)}
            className="group relative min-h-40 overflow-hidden rounded-container bg-card p-6 text-left shadow-soft transition-all duration-fast ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:bg-surface-container-low hover:shadow-soft-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 sm:min-h-44"
          >
            <span
              className="absolute inset-x-0 top-0 h-1 bg-track-pink transition-[height] duration-fast group-hover:h-1.5"
              aria-hidden="true"
            />
            <span className="flex items-start justify-between gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[3px] border-track-ring bg-background text-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
                <Icon size={19} aria-hidden="true" />
              </span>
              <ArrowRight
                size={18}
                className="mt-2 shrink-0 text-muted-foreground transition-transform duration-fast group-hover:translate-x-1 group-hover:text-foreground"
                aria-hidden="true"
              />
            </span>
            <span className="mt-6 block text-base font-bold leading-snug">{choice.title}</span>
            <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">
              {choice.description}
            </span>
            {requiresAuth && !user && (
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-badge bg-surface-container-high px-2.5 py-1 text-2xs font-semibold text-muted-foreground">
                <LockKeyhole size={12} aria-hidden="true" />
                {t('contribute.auth.title', 'Sign in to contribute')}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function RouteSignal() {
  return (
    <div className="flex items-center" aria-hidden="true">
      <span className="h-3 w-3 shrink-0 rounded-full border-[3px] border-track-ring bg-background" />
      <span className="h-1 flex-1 bg-track-pink" />
      <span className="h-4 w-4 shrink-0 rounded-full border-[3px] border-track-ring bg-background" />
      <span className="h-1 w-12 bg-track-pink sm:w-20" />
      <span className="h-3 w-3 shrink-0 rounded-full border-[3px] border-track-ring bg-background" />
    </div>
  );
}
