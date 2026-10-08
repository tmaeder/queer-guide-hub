import { lazy, Suspense, useState } from 'react';
import { Camera, Lightbulb, ListPlus, PencilLine, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageLoadingState } from '@/components/layout/PageLoadingState';

const FeedbackForm = lazy(() => import('./FeedbackForm'));
const CorrectionForm = lazy(() => import('./CorrectionForm'));
const AddSomethingBranch = lazy(() => import('./AddSomethingBranch'));
const FlyerScanBranch = lazy(() => import('./FlyerScanBranch'));

export type ContributeBranch = 'chooser' | 'feedback' | 'correction' | 'add' | 'scan';

interface ContributeDialogProps {
  mode?: 'dialog' | 'page';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialBranch?: ContributeBranch;
  initialType?: string;
  screenshotBlob?: Blob | null;
}

export function ContributeDialog({
  mode = 'dialog',
  open = true,
  onOpenChange,
  initialBranch = 'chooser',
  initialType,
  screenshotBlob,
}: ContributeDialogProps) {
  const { t } = useTranslation();
  const [branch, setBranch] = useState<ContributeBranch>(initialBranch);
  const [activeType, setActiveType] = useState(initialType);

  const title =
    branch === 'feedback'
      ? t('contribute.feedback.heading', 'Report a problem or share an idea')
      : branch === 'correction'
        ? t('contribute.correction.heading', 'Fix something on this page')
        : branch === 'add'
          ? t('contribute.add.heading', 'Add something new')
          : branch === 'scan'
            ? t('contribute.scan.heading', 'Scan a flyer or link')
            : t('contribute.title', 'Contribute to Queer Guide');

  const close = () => {
    if (mode === 'page') setBranch('chooser');
    else onOpenChange?.(false);
  };
  const body = (
    <Suspense fallback={<PageLoadingState />}>
      {branch === 'chooser' && <Chooser onChoose={setBranch} />}
      {branch === 'feedback' && (
        <FeedbackForm
          screenshotBlob={screenshotBlob}
          onCancel={() => setBranch('chooser')}
          onDone={close}
        />
      )}
      {branch === 'correction' && (
        <CorrectionForm onCancel={() => setBranch('chooser')} onDone={close} />
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
      {branch === 'scan' && <FlyerScanBranch onBack={() => setBranch('chooser')} />}
    </Suspense>
  );

  if (mode === 'page') {
    return (
      <PageContainer size={branch === 'scan' || branch === 'add' ? 'page' : 'reading'}>
        <header className="mb-8">
          <p className="text-2xs font-semibold uppercase tracking-label text-muted-foreground">
            {t('contribute.eyebrow', 'Contribute')}
          </p>
          <h1 className="mt-2 text-display font-bold">{title}</h1>
        </header>
        {body}
      </PageContainer>
    );
  }

  const roomy = branch === 'scan' || branch === 'add';
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
        className={roomy ? 'max-h-[92vh] overflow-y-auto' : undefined}
        style={{ maxWidth: roomy ? 'min(1120px, calc(100vw - 2rem))' : 520 }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function Chooser({ onChoose }: { onChoose: (branch: ContributeBranch) => void }) {
  const { t } = useTranslation();
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
      branch: 'scan',
      icon: Camera,
      title: t('contribute.chooser.scanTitle', 'Scan a flyer or link'),
      description: t(
        'contribute.chooser.scanBody',
        'Extract several submissions from files or a web page.',
      ),
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {choices.map((choice) => {
        const Icon = choice.icon;
        return (
          <button
            key={choice.branch}
            type="button"
            onClick={() => onChoose(choice.branch)}
            className="group rounded-container border bg-card p-4 text-left transition-colors hover:border-foreground/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-element bg-muted group-hover:bg-foreground group-hover:text-background">
              <Icon size={20} aria-hidden="true" />
            </span>
            <span className="block font-semibold">{choice.title}</span>
            <span className="mt-2 block text-sm text-muted-foreground">{choice.description}</span>
          </button>
        );
      })}
    </div>
  );
}
