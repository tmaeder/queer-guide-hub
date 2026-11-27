import { useTheme } from '@/components/theme/ThemeProvider';
import { Toaster as Sonner, toast } from 'sonner';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from '@/components/icons';
import { TrackLoader } from '@/components/transit/TrackLoader';

const ICONS = {
  success: <CheckCircle2 size={20} aria-hidden />,
  info: <Info size={20} aria-hidden />,
  warning: <AlertTriangle size={20} aria-hidden />,
  error: <AlertCircle size={20} aria-hidden />,
  // The site's own loader; a rotating spinner is banned by the design contract.
  loading: <TrackLoader size={20} />,
};

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme === 'system' ? undefined : theme}
      className="toaster group"
      // No richColors. Strict B&W: toasts use neutral surfaces;
      // semantic differentiation comes from the type icon Sonner
      // injects (success / error / warning / info), not from hue.
      // Avoids the dark-mode white-on-red contrast fail (~3.96:1)
      // that richColors produced on destructive toasts.
      closeButton
      icons={ICONS}
      style={{ zIndex: 'var(--z-toast)' }}
      toastOptions={{
        // Sonner's own stylesheet is unlayered, so it beats Tailwind utilities;
        // every override here needs `!`. Same card as the cookie and install
        // banners: paper, soft shadow, no border.
        classNames: {
          toast:
            'group toast !gap-2 !rounded-container !border-0 !bg-card !py-2 !ps-4 !pe-12 !text-foreground !shadow-soft-lg',
          title: '!text-13 !font-bold !leading-snug',
          description: '!text-xs2 !leading-snug !text-muted-foreground',
          actionButton:
            '!h-11 !rounded-element !bg-foreground !px-4 !text-13 !font-bold !text-background',
          cancelButton:
            '!h-11 !rounded-element !bg-muted !px-4 !text-13 !font-bold !text-foreground',
          // Inside the card on the right, vertically centred, at the 44px
          // touch-target size index.css enforces on every button. Sonner's
          // default is a 20px disc hanging off the top-left corner.
          // Icons come from the site's own outline set (see `icons` below), so
          // every toast type shares one look. Errors take --destructive, the
          // one hue the design system reserves for hard failures.
          icon: '!m-0 !size-5 !justify-center',
          error: '[&_[data-icon]]:!text-destructive',
          closeButton:
            '!left-auto !right-0.5 !top-1/2 !size-11 !-translate-y-1/2 !transform-none !rounded-element !border-0 !bg-transparent !text-muted-foreground hover:!bg-muted hover:!text-foreground [&_svg]:!size-4',
        },
      }}
      {...props}
    />
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export { Toaster, toast };
