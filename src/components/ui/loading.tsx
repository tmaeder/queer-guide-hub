import { useTranslation } from 'react-i18next';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  /** Accessible name announced to screen readers when no visible text is shown. */
  label?: string;
  className?: string;
}

const dotSize = { sm: 'h-1.5 w-1.5', md: 'h-2 w-2', lg: 'h-3 w-3' } as const;
const spinnerSize = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' } as const;

export function Loading({ size = 'md', text, label }: LoadingProps) {
  const { t } = useTranslation();
  const announce = text ?? label ?? t('common.loading');

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={text ? undefined : announce}
      className="flex flex-col items-center justify-center gap-4"
    >
      <div className="flex items-center gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{ animationDelay: `${i * 0.2}s` }}
            className={`${dotSize[size]} rounded-full bg-current animate-pulse motion-reduce:animate-none`}
          />
        ))}
      </div>
      {text && <p className="text-sm text-muted-foreground m-0">{text}</p>}
    </div>
  );
}

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  /** Accessible name; set to null when a parent already exposes a status region. */
  label?: string | null;
  className?: string;
}

export function LoadingSpinner({ size = 'md', label, className }: LoadingSpinnerProps) {
  const { t } = useTranslation();
  // When rendered inside a parent status region, pass label={null} to avoid a
  // duplicate announcement.
  const a11y =
    label === null
      ? { 'aria-hidden': true as const }
      : { role: 'status' as const, 'aria-live': 'polite' as const, 'aria-label': label ?? t('common.loading') };

  return (
    <div
      {...a11y}
      className={`${spinnerSize[size]} rounded-full border-2 border-border border-t-current animate-spin motion-reduce:animate-none ${className ?? ''}`}
    />
  );
}

interface PageLoadingProps {
  text?: string;
}

export function PageLoading({ text }: PageLoadingProps) {
  const { t } = useTranslation();
  const label = text ?? t('common.loading');

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center"
    >
      <div className="text-center flex flex-col gap-6">
        <div className="flex items-center justify-center gap-2" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{ animationDelay: `${i * 0.1}s` }}
              className="h-3 w-3 rounded-full bg-current animate-bounce motion-reduce:animate-none"
            />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold m-0">{label}</h2>
          <div className="flex items-center justify-center gap-1">
            <LoadingSpinner size="sm" label={null} />
            <span className="text-sm text-muted-foreground ml-2">{t('common.pleaseWait', 'Please wait')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface InlineLoadingProps {
  text?: string;
  size?: 'sm' | 'md';
}

export function InlineLoading({ text, size = 'md' }: InlineLoadingProps) {
  const { t } = useTranslation();
  const label = text ?? t('common.loading');

  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-4 py-8">
      <LoadingSpinner size={size} label={null} />
      <span className={`text-muted-foreground ${size === 'sm' ? 'text-sm' : 'text-base'}`}>{label}</span>
    </div>
  );
}
