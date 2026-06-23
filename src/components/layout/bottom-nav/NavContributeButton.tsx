import { Plus } from 'lucide-react';

interface NavContributeButtonProps {
  /** Localized aria-label (context-aware submit CTA, or sign-in prompt). */
  label: string;
  onClick: () => void;
}

/**
 * The raised centre contribute button. Bespoke (not a destination tab): it
 * routes to the context-aware submission form when signed in, or opens the auth
 * dialog for anonymous users — the parent owns that logic and passes the
 * resolved label + handler. The single accent fill is the design-system's one
 * permitted brand CTA per surface.
 */
export function NavContributeButton({ label, onClick }: NavContributeButtonProps) {
  return (
    <li className="flex flex-1 items-center justify-center">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="-mt-4 flex h-12 w-12 items-center justify-center rounded-element border border-accent-brand bg-accent-brand text-accent-brand-foreground transition-transform active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Plus className="h-6 w-6" aria-hidden />
      </button>
    </li>
  );
}
