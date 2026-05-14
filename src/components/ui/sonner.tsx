import { useTheme } from '@/components/theme/ThemeProvider';
import { Toaster as Sonner, toast } from 'sonner';

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
      toastOptions={{
        classNames: {
          toast: 'group toast',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export { Toaster, toast };
