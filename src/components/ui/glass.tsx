import * as React from 'react';
import { ArrowUpRight } from '@phosphor-icons/react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { cn } from '@/lib/utils';

/**
 * Ethereal Glass design primitives (2026-06-17 reskin).
 *
 * - {@link EtherSection}  OLED canvas + drifting mesh orbs + film grain.
 * - {@link GlassCard}     Double-bezel "machined tray holding a glass plate".
 * - {@link MagneticCTA}   Pill button with a nested button-in-button arrow that
 *                         carries kinetic tension on hover.
 *
 * Motion is CSS-driven (transform/opacity only) and honours
 * `prefers-reduced-motion`. Forces the dark OLED context via `.dark` so the
 * surface reads correctly regardless of the global theme during rollout.
 */

interface EtherSectionProps extends React.HTMLAttributes<HTMLElement> {
  /** Render the drifting violet/emerald mesh orbs. Default true. */
  orbs?: boolean;
  /** Render the fixed film-grain overlay. Default true. */
  grain?: boolean;
}

export function EtherSection({
  orbs = true,
  grain = true,
  className,
  children,
  ...props
}: EtherSectionProps) {
  return (
    <section
      className={cn(
        'dark ether-canvas relative overflow-hidden',
        orbs && 'mesh-orbs',
        grain && 'ether-grain',
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Inner-core className (padding, layout). */
  coreClassName?: string;
}

export function GlassCard({ className, coreClassName, children, ...props }: GlassCardProps) {
  return (
    <div className={cn('glass-shell', className)} {...props}>
      <div className={cn('glass-core h-full', coreClassName)}>{children}</div>
    </div>
  );
}

interface MagneticCTAProps {
  to: string;
  children: React.ReactNode;
  /** Inverted (light pill) for the primary action. Default false (glass). */
  solid?: boolean;
  className?: string;
}

/**
 * Pill CTA with the nested "button-in-button" trailing arrow. The icon sits in
 * its own circular well flush with the right padding and translates diagonally
 * with a spring curve on hover, while the whole pill depresses on press.
 */
export function MagneticCTA({ to, children, solid = false, className }: MagneticCTAProps) {
  return (
    <LocalizedLink
      to={to}
      className={cn(
        'group inline-flex items-center gap-2 rounded-full py-2 pl-6 pr-2 text-sm font-medium no-underline',
        'transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]',
        solid
          ? 'bg-white text-black hover:bg-white/90'
          : 'border border-white/12 bg-white/5 text-white backdrop-blur-md hover:bg-white/10',
        className,
      )}
    >
      <span>{children}</span>
      <span
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full',
          'transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
          'group-hover:translate-x-1 group-hover:-translate-y-px group-hover:scale-105',
          solid ? 'bg-black/8' : 'bg-white/10',
        )}
      >
        <ArrowUpRight weight="light" className="h-4 w-4" />
      </span>
    </LocalizedLink>
  );
}
