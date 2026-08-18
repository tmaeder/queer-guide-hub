import { useTranslation } from 'react-i18next';
import { TrackLoader } from '@/components/transit/TrackLoader';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  /** Accessible name announced to screen readers when no visible text is shown. */
  label?: string;
  className?: string;
}

const dotSize = { sm: 'h-1.5 w-1.5', md: 'h-2 w-2', lg: 'h-3 w-3' } as const;

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
          /* Spec, "Micro": three stations on a hidden track. They POP in
             sequence (station-pop, 500ms, 1.28x overshoot) rather than
             pulsing opacity — a station appearing as the line reaches it,
             which is the same event the map uses. */
          <span
            key={i}
            style={{ animationDelay: `${i * 0.15}s`, animationIterationCount: 'infinite' }}
            className={`${dotSize[size]} station-pop rounded-full border-border-hairline bg-background`}
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
      : {
          role: 'status' as const,
          'aria-live': 'polite' as const,
          'aria-label': label ?? t('common.loading'),
        };

  // Was a rotating border ring. The design system replaces every spinner with
  // a track loop — nothing in a transit system spins, things travel a line.
  const px = { sm: 16, md: 24, lg: 32 } as const;
  return <TrackLoader size={px[size]} className={className} {...a11y} />;
}

interface PageLoadingProps {
  text?: string;
}

export function PageLoading({ text }: PageLoadingProps) {
  const { t } = useTranslation();
  const label = text ?? t('common.loading');

  return (
    <div role="status" aria-live="polite" className="flex min-h-screen items-center justify-center">
      <div className="text-center flex flex-col gap-4">
        {/* One indicator, not dots + spinner + "please wait" stacked. */}
        <div className="flex items-center justify-center gap-2" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{ animationDelay: `${i * 0.1}s` }}
              className="h-3 w-3 rounded-full bg-current animate-pulse motion-reduce:animate-none"
            />
          ))}
        </div>
        <h2 className="text-lg font-semibold m-0 text-muted-foreground">{label}</h2>
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
      <span className={`text-muted-foreground ${size === 'sm' ? 'text-sm' : 'text-base'}`}>
        {label}
      </span>
    </div>
  );
}
