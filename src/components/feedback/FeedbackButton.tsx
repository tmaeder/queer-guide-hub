import { Suspense, useCallback, useEffect, useState } from 'react';
import { MessageSquarePlus } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { lazyRetry } from '@/utils/lazyRetry';
import './FeedbackButton.css';

const ContributeDialog = lazyRetry(() =>
  import('@/components/contribute/ContributeDialog').then((m) => ({ default: m.ContributeDialog })),
);

/** Global contribution trigger. All form implementations live in ContributeDialog branches. */
export function FeedbackButton({ inline = false }: { inline?: boolean } = {}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [dialogMounted, setDialogMounted] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [screenshotBlob, setScreenshotBlob] = useState<Blob | null>(null);
  const [footerVisible, setFooterVisible] = useState(false);

  useEffect(() => {
    if (inline || typeof IntersectionObserver === 'undefined') return;
    let footer: Element | null = null;

    // Yield to the footer's navigation and copyright at every responsive height.
    const observer = new IntersectionObserver((entries) => {
      const entry = entries.find((entry) => entry.target === footer);
      if (entry) setFooterVisible(entry.isIntersecting);
    });
    const connectFooter = () => {
      const nextFooter = document.querySelector('[data-site-footer]');
      if (nextFooter === footer) return;
      if (footer) observer.disconnect();
      footer = nextFooter;
      if (footer) observer.observe(footer);
      else setFooterVisible(false);
    };
    // Route transitions can mount or replace the footer after this effect runs.
    const mutations = new MutationObserver(connectFooter);
    mutations.observe(document.body, { childList: true, subtree: true });
    connectFooter();
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [inline]);

  // Capture before the portal mounts so the contribution window is not part
  // of the image. The dedicated community-report endpoint accepts anonymous
  // screenshots without exposing the general-purpose image uploader.
  const handleOpen = useCallback(async () => {
    setCapturing(true);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    try {
      const { captureScreenshot } = await import('@/utils/feedbackContext');
      setScreenshotBlob(await captureScreenshot());
    } finally {
      setCapturing(false);
      setDialogMounted(true);
      setOpen(true);
    }
  }, []);

  const label = t('contribute.trigger', 'Contribute to Queer Guide');

  const trigger = (
    <button
      type="button"
      aria-label={label}
      onClick={() => void handleOpen()}
      disabled={capturing}
      className={
        inline
          ? 'inline-flex min-h-12 items-center gap-2 rounded-element px-4 py-2 text-15 font-bold hover:bg-background disabled:opacity-50'
          : 'contribution-trigger fixed right-6 z-[45] flex h-12 w-12 items-center justify-center rounded-container bg-foreground text-background shadow-soft transition-[opacity,box-shadow,translate] hover:-translate-y-0.5 hover:shadow-soft-hover disabled:opacity-50'
      }
      style={{ visibility: capturing ? 'hidden' : 'visible' }}
    >
      <MessageSquarePlus size={22} aria-hidden="true" />
      {inline && label}
    </button>
  );

  return (
    <>
      {inline
        ? trigger
        : !footerVisible && (
            <Tooltip>
              <TooltipTrigger asChild>{trigger}</TooltipTrigger>
              <TooltipContent side="left">{label}</TooltipContent>
            </Tooltip>
          )}

      {dialogMounted && (
        <Suspense fallback={null}>
          <ContributeDialog open={open} onOpenChange={setOpen} screenshotBlob={screenshotBlob} />
        </Suspense>
      )}
    </>
  );
}
