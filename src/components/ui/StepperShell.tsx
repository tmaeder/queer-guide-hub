import * as React from 'react';
import { Check, ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AnimatedBeamConnector } from '@/components/ui/AnimatedBeamConnector';

export interface StepperStep {
  id: string;
  label: string;
  description?: string;
}

interface StepperShellProps {
  steps: StepperStep[];
  current: number;
  onPrev?: () => void;
  onNext?: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  prevLabel?: string;
  skipLabel?: string;
  canGoNext?: boolean;
  canGoPrev?: boolean;
  showSkip?: boolean;
  variant?: 'celebrate' | 'discreet';
  children: React.ReactNode;
  footerExtra?: React.ReactNode;
  className?: string;
}

/**
 * Multi-step layout shell. Two visual modes:
 * - "celebrate" (default): vertical sidebar with animated beam connectors, CSS motion
 * - "discreet": dense line counter + thin progress bar, no decorative motion (Intimate)
 */
export function StepperShell({
  steps,
  current,
  onPrev,
  onNext,
  onSkip,
  nextLabel = 'Next',
  prevLabel = 'Back',
  skipLabel = 'Skip',
  canGoNext = true,
  canGoPrev = true,
  showSkip = false,
  variant = 'celebrate',
  children,
  footerExtra,
  className,
}: StepperShellProps) {
  const total = steps.length;
  const active = steps[current];
  const progressPct = ((current + 1) / total) * 100;

  if (variant === 'discreet') {
    return (
      <div className={cn('min-h-screen bg-background flex flex-col', className)}>
        <div className="border-b border-border">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
            <div className="flex items-baseline gap-4">
              <span className="text-xs tracking-widest uppercase text-muted-foreground">
                {String(current + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
              </span>
              <span className="text-sm font-medium">{active?.label}</span>
            </div>
            {onSkip && showSkip && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSkip}
                className="text-muted-foreground"
              >
                {skipLabel}
              </Button>
            )}
          </div>
          <div className="h-px bg-border relative">
            <div
              className="absolute inset-y-0 left-0 bg-foreground transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: `${progressPct}%`, height: '1px' }}
            />
          </div>
        </div>

        {/* No step-swap animation: AnimatePresence mode="wait" freezes the
            exiting step's children, and a stalled exit leaves the previous
            step's content on screen while the header advances (seen live on
            /intimate/onboard 2026-06-11). Discreet mode promises no
            decorative motion anyway — swap instantly. */}
        <div className="flex-1 container mx-auto px-4 py-8 max-w-2xl w-full">
          <div key={active?.id ?? current}>{children}</div>
        </div>

        <div className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-4 max-w-2xl flex items-center justify-between gap-4">
            <Button
              variant="ghost"
              onClick={onPrev}
              disabled={!canGoPrev || current === 0}
              className="rounded-element"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {prevLabel}
            </Button>
            <div className="flex items-center gap-4">
              {footerExtra}
              <Button
                onClick={onNext}
                disabled={!canGoNext}
                className="rounded-element"
              >
                {nextLabel}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('min-h-screen bg-background', className)}>
      <div className="container mx-auto px-4 py-8 lg:py-12">
        <div className="grid lg:grid-cols-[280px_1fr] gap-8 lg:gap-12">
          {/* Sidebar: vertical step indicator */}
          <aside className="hidden lg:block">
            <ol className="relative space-y-6">
              {steps.map((step, i) => {
                const status = i < current ? 'done' : i === current ? 'active' : 'pending';
                return (
                  <li key={step.id} className="relative flex gap-4">
                    {i < steps.length - 1 && (
                      <AnimatedBeamConnector
                        active={i < current}
                        className="absolute left-[15px] top-8 h-[calc(100%+1rem)] w-px"
                      />
                    )}
                    <span
                      className={cn(
                        'relative z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                        status === 'done' &&
                          'bg-foreground border-foreground text-background',
                        status === 'active' &&
                          'border-foreground text-foreground bg-background',
                        status === 'pending' &&
                          'border-border text-muted-foreground bg-background',
                      )}
                    >
                      {status === 'done' ? (
                        <Check size={16} />
                      ) : (
                        <span className="text-xs font-semibold">{i + 1}</span>
                      )}
                    </span>
                    <div className="flex-1 pt-1">
                      <p
                        className={cn(
                          'text-sm transition-colors',
                          status === 'active' && 'font-semibold text-foreground',
                          status === 'done' && 'text-muted-foreground',
                          status === 'pending' && 'text-muted-foreground',
                        )}
                      >
                        {step.label}
                      </p>
                      {step.description && status === 'active' && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {step.description}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </aside>

          {/* Mobile: horizontal pills */}
          <div className="lg:hidden">
            <div className="flex gap-1.5 mb-2">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'h-1 flex-1 rounded-full transition-opacity motion-reduce:transition-none',
                    i <= current ? 'bg-foreground opacity-100' : 'bg-border opacity-50',
                  )}
                />
              ))}
            </div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Step {current + 1} of {total}
            </p>
            <h2 className="text-lg font-semibold mt-1">{active?.label}</h2>
          </div>

          {/* Body */}
          <main className="min-w-0">
            {/* Enter-only CSS slide (no exit): a stalled AnimatePresence exit
                left the previous step's content frozen on screen (see the
                discreet-mode note above) and framer here dragged ~97 KB into
                the bundle. Keyed remount replays the enter animation. */}
            <div key={active?.id ?? current} className="step-enter">
              {children}
            </div>

            <div className="mt-12 pt-6 border-t border-border flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={onPrev}
                  disabled={!canGoPrev || current === 0}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  {prevLabel}
                </Button>
                {onSkip && showSkip && (
                  <Button
                    variant="ghost"
                    onClick={onSkip}
                    className="text-muted-foreground"
                  >
                    {skipLabel}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-4">
                {footerExtra}
                <Button onClick={onNext} disabled={!canGoNext}>
                  {nextLabel}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
