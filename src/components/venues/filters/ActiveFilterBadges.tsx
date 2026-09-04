import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { xStyle } from './constants';
import { RemovableFilterX } from './RemovableFilterX';

interface ActiveFilterBadgesProps {
  search: string;
  city: string;
  selectedTags: string[];
  selectedAmenities: string[];
  selectedServices: string[];
  selectedAccessibilityAttributes: string[];
  selectedTargetGroups: string[];
  nearMe: boolean;
  accessibilityLabel: (slug: string) => string;
  onRemoveSearch: () => void;
  onRemoveCity: () => void;
  onToggleTag: (v: string) => void;
  onToggleAmenity: (v: string) => void;
  onToggleService: (v: string) => void;
  onToggleAccessibility: (v: string) => void;
  onToggleTargetGroup: (v: string) => void;
  onNearMeToggle: () => void;
  onClearAll: () => void;
}

/** Always-visible removable badges for every active filter + clear-all. */
export function ActiveFilterBadges({
  search,
  city,
  selectedTags,
  selectedAmenities,
  selectedServices,
  selectedAccessibilityAttributes,
  selectedTargetGroups,
  nearMe,
  accessibilityLabel,
  onRemoveSearch,
  onRemoveCity,
  onToggleTag,
  onToggleAmenity,
  onToggleService,
  onToggleAccessibility,
  onToggleTargetGroup,
  onNearMeToggle,
  onClearAll,
}: ActiveFilterBadgesProps) {
  return (
    <div className="flex flex-wrap gap-1.5 items-center pt-1 px-1">
      {search && (
        <Badge variant="secondary">
          &ldquo;{search}&rdquo;
          <RemovableFilterX style={xStyle} label="Remove filter" onRemove={onRemoveSearch} />
        </Badge>
      )}
      {city && (
        <Badge variant="secondary">
          {city}
          <RemovableFilterX style={xStyle} label="Remove filter" onRemove={onRemoveCity} />
        </Badge>
      )}
      {selectedTags.map((tag) => (
        <Badge key={tag} variant="secondary">
          {tag}
          <RemovableFilterX style={xStyle} label="Remove filter" onRemove={() => onToggleTag(tag)} />
        </Badge>
      ))}
      {selectedAmenities.map((a) => (
        <Badge key={a} variant="secondary">
          {a}
          <RemovableFilterX style={xStyle} label="Remove filter" onRemove={() => onToggleAmenity(a)} />
        </Badge>
      ))}
      {selectedServices.map((s) => (
        <Badge key={s} variant="secondary">
          {s}
          <RemovableFilterX style={xStyle} label="Remove filter" onRemove={() => onToggleService(s)} />
        </Badge>
      ))}
      {selectedAccessibilityAttributes.map((a) => (
        <Badge key={a} variant="secondary">
          {accessibilityLabel(a)}
          <RemovableFilterX
            style={xStyle}
            label="Remove filter"
            onRemove={() => onToggleAccessibility(a)}
          />
        </Badge>
      ))}
      {selectedTargetGroups.map((g) => (
        <Badge key={g} variant="secondary">
          {g}
          <RemovableFilterX
            style={xStyle}
            label="Remove filter"
            onRemove={() => onToggleTargetGroup(g)}
          />
        </Badge>
      ))}
      {nearMe && (
        <Badge variant="secondary">
          Near Me
          <RemovableFilterX style={xStyle} label="Remove filter" onRemove={onNearMeToggle} />
        </Badge>
      )}
      <Button variant="ghost" size="sm" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  );
}
