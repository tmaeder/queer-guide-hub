import { useCallback, useEffect, useState } from 'react';
import { MessageSquarePlus } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ContributeDialog } from '@/components/contribute/ContributeDialog';
import { useIsMobile } from '@/hooks/use-mobile';

/** Global contribution trigger. All form implementations live in ContributeDialog branches. */
export function FeedbackButton() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [screenshotBlob, setScreenshotBlob] = useState<Blob | null>(null);
  const [footerVisible, setFooterVisible] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
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
  }, []);

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
      setOpen(true);
    }
  }, []);

  const label = t('contribute.trigger', 'Contribute to Queer Guide');

  return (
    <>
      {!footerVisible && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={label}
              onClick={() => void handleOpen()}
              disabled={capturing}
              // z-[45]: above page chrome (z-40) and below every portal (z-50).
              // A prior z-[1200] value painted over the mobile search sheet
              // (#2814). Do not promote this page affordance above modal layers.
              className="fixed right-6 z-[45] flex h-12 w-12 items-center justify-center rounded-container bg-foreground text-background shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-soft-hover disabled:opacity-50"
              style={{
                visibility: capturing ? 'hidden' : 'visible',
                bottom: isMobile
                  ? 'calc(max(6rem, var(--map-rail-clearance, 0rem) + 1rem) + env(safe-area-inset-bottom, 0px) + var(--audio-bar-clearance, 0rem) + var(--consent-bar-clearance, 0px))'
                  : 'calc(1.5rem + var(--audio-bar-clearance, 0rem) + var(--consent-bar-clearance, 0px))',
              }}
            >
              <MessageSquarePlus size={22} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{label}</TooltipContent>
        </Tooltip>
      )}

      <ContributeDialog open={open} onOpenChange={setOpen} screenshotBlob={screenshotBlob} />
    </>
  );
}
