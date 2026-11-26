import { useMyIntimateProfile } from '@/hooks/useIntimateProfile';
import { CheckSquare } from '@/components/icons';
import { KinkVisibilityStep } from '@/components/kinks/KinkVisibilityStep';

/** Checklist visibility on Privacy & visibility. Only for members with an active intimate profile. */
export function KinkVisibilitySettings() {
  const { data: me } = useMyIntimateProfile();
  if (!me?.opted_in_at) return null;
  return (
    <section
      aria-labelledby="kink-visibility-heading"
      className="flex flex-col gap-4 rounded-container bg-card p-6 shadow-soft"
    >
      <div>
        <h3 id="kink-visibility-heading" className="flex items-center gap-2.5 font-semibold">
          <CheckSquare size={18} aria-hidden className="shrink-0 text-muted-foreground" />
          Interests & boundaries checklist
        </h3>
        <p className="text-sm text-muted-foreground">
          Who sees each category. Your no's and hard limits are never shown to anyone.
        </p>
      </div>
      <KinkVisibilityStep />
    </section>
  );
}
