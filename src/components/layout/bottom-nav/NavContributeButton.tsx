import { Plus } from '@/components/icons';

interface NavContributeButtonProps {
  /** Localized aria-label (context-aware submit CTA, or sign-in prompt). */
  label: string;
  onClick: () => void;
}

/**
 * The centre contribute button. Bespoke (not a destination tab): it
 * routes to the context-aware submission form when signed in, or opens the auth
 * dialog for anonymous users — the parent owns that logic and passes the
 * resolved label + handler. The single accent fill is the design-system's one
 * permitted brand CTA per surface.
 */
export function NavContributeButton({ label, onClick }: NavContributeButtonProps) {
  return (
    <li className="flex w-20 shrink-0 items-center justify-center">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        // Pink track = the dock's one brand CTA. The 4px ink ring cuts the
        // button out of the dock edge; the inner track-ring border is the
        // WCAG 1.4.11 edge every track-coloured mark carries.
        className="flex h-20 w-20 items-center justify-center rounded-full border border-track-ring bg-track-pink text-foreground shadow-soft ring-4 ring-foreground transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-background"
      >
        <Plus className="h-6 w-6" strokeWidth={2.75} aria-hidden />
      </button>
    </li>
  );
}
