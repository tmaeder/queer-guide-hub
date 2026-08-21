import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

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

/**
 * Always-visible removable badges for every active filter, plus clear-all.
 *
 * TWO REAL DEFECTS WERE FIXED HERE, and both were invisible because the markup
 * *looked* fine:
 *
 *  - the remove control was `<X role="button" onClick>` — a lucide SVG. A
 *    `role="button"` does NOT make an element focusable, and an `<svg>` is not
 *    in the tab order, so **none of these filters could be removed by keyboard
 *    or by a screen reader** — on the primary filter surface of /venues. Only a
 *    pointer worked.
 *  - all eight announced the same accessible name, "Remove filter", so a
 *    screen-reader user hearing eight identical buttons had no way to tell
 *    which one removed the city and which removed a tag. Each name now says
 *    what it removes.
 *
 * Building the list as DATA rather than eight near-identical JSX blocks is what
 * makes that one rule instead of eight places to get it right again. The badge
 * stays a `<Badge>` (which renders a `<div>`), so a real `<button>` inside it
 * is not axe `nested-interactive`.
 */
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
  const { t } = useTranslation();

  const chips: { key: string; label: string; onRemove: () => void }[] = [];

  if (search) chips.push({ key: 'search', label: `“${search}”`, onRemove: onRemoveSearch });
  if (city) chips.push({ key: 'city', label: city, onRemove: onRemoveCity });
  selectedTags.forEach((v) =>
    chips.push({ key: `tag:${v}`, label: v, onRemove: () => onToggleTag(v) }),
  );
  selectedAmenities.forEach((v) =>
    chips.push({ key: `amenity:${v}`, label: v, onRemove: () => onToggleAmenity(v) }),
  );
  selectedServices.forEach((v) =>
    chips.push({ key: `service:${v}`, label: v, onRemove: () => onToggleService(v) }),
  );
  selectedAccessibilityAttributes.forEach((v) =>
    chips.push({
      key: `a11y:${v}`,
      label: accessibilityLabel(v),
      onRemove: () => onToggleAccessibility(v),
    }),
  );
  selectedTargetGroups.forEach((v) =>
    chips.push({ key: `group:${v}`, label: v, onRemove: () => onToggleTargetGroup(v) }),
  );
  if (nearMe) {
    chips.push({
      key: 'nearMe',
      label: t('pages.venues.nearMe', 'Near Me'),
      onRemove: onNearMeToggle,
    });
  }

  // No early return on an empty list: the caller gates on `hasActiveFilters`,
  // which counts `category` too — and category has no chip here, so bailing out
  // would take the Clear-all button away in exactly that case.
  return (
    <div className="flex flex-wrap gap-1.5 items-center pt-1 px-1">
      {chips.map((chip) => (
        <Badge key={chip.key} variant="secondary">
          {chip.label}
          <RemoveFilterButton
            label={chip.label}
            onRemove={chip.onRemove}
            accessibleName={t('search.removeFilter', 'Remove filter {{label}}', {
              label: chip.label,
            })}
          />
        </Badge>
      ))}
      <Button variant="ghost" size="sm" onClick={onClearAll}>
        {t('common.clearAll', 'Clear all')}
      </Button>
    </div>
  );
}

/**
 * The remove control, as a real `<button>`.
 *
 * `-me-1` claws back the button's own trailing padding so the badge keeps the
 * optical inset it had when this was a bare 12px glyph — the padding is the
 * tap target, not decoration, and it replaces the `xStyle` negative-margin
 * shim that existed only to give an unfocusable SVG one.
 */
function RemoveFilterButton({
  label,
  accessibleName,
  onRemove,
}: {
  label: string;
  accessibleName: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={accessibleName}
      title={accessibleName}
      data-filter-label={label}
      className="-me-1 ms-1 inline-flex items-center justify-center rounded-badge p-1 transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
    >
      <X className="h-3 w-3" aria-hidden="true" />
    </button>
  );
}
