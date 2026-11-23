import { useTranslation } from 'react-i18next';
import { Briefcase, Heart, Luggage, MapPin, Users } from '@/components/icons';
import { ToggleChip } from '@/components/ui/ToggleChip';
import {
  useUserIntent,
  LOOKING_FOR_OPTIONS,
  LOOKING_FOR_LABELS,
  type LookingFor,
} from '@/hooks/useUserIntent';

const ICONS: Record<LookingFor, typeof Heart> = {
  friends: Users,
  dating: Heart,
  travel_buddies: Luggage,
  locals: MapPin,
  networking: Briefcase,
};

/**
 * The canonical "what you're looking for" chips. Single source of truth for
 * profiles.looking_for, rendered in the unified StatusEditor. Self-saving via
 * useUserIntent; no props needed.
 */
export function IntentChips() {
  const { t } = useTranslation();
  const { lookingFor, toggleLookingFor } = useUserIntent();

  return (
    <div className="flex flex-wrap gap-1.5">
      {LOOKING_FOR_OPTIONS.map((v) => {
        const Icon = ICONS[v];
        return (
          <ToggleChip
            key={v}
            pressed={lookingFor.includes(v)}
            onPressedChange={() => toggleLookingFor(v)}
            icon={<Icon size={14} aria-hidden="true" />}
          >
            {t(`people.intent.lookingForOptions.${v}`, LOOKING_FOR_LABELS[v])}
          </ToggleChip>
        );
      })}
    </div>
  );
}
