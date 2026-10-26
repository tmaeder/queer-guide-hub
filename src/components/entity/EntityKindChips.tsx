import { useTranslation } from 'react-i18next';
import { Building2, MapPin, type LucideIcon } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import type { OrgRole } from '@/hooks/useOrganization';
import { entityKindLabel, orgRoleLabel, type EntityKind } from '@/lib/entityKindLabels';

export type { EntityKind };

export interface EntityKindEntry {
  kind: EntityKind;
  /** Set on the chip for the OTHER page: an organisation that also runs a
   *  location links its "Location" chip to that location, and vice versa. The
   *  chip for the page being read carries no href — it describes, it does not
   *  navigate. */
  href?: string;
}

// Spine-internal roles describe how an organisation links to a typed table,
// not anything a reader needs told. `venue` is already the Location chip.
const HIDDEN_ROLES = new Set<string>(['venue', 'brand', 'hotel', 'affiliate_partner']);

const KIND_ICON: Record<EntityKind, LucideIcon> = {
  venue: MapPin,
  organization: Building2,
};

/**
 * What a detail page IS — Location, Organisation, or both — shared by the venue
 * and the organisation page so the two read as one kind of page.
 *
 * Many organisations are the identity behind exactly one location (the spine
 * mints one per venue), so "both" is common, not an edge case. The chip for
 * the other half links across, which is what makes the pair legible from
 * either side. Each chip carries an icon and a word, so the kind never rests on
 * colour alone (WCAG 1.4.1).
 */
export function EntityKindChips({
  kinds,
  roles = [],
}: {
  kinds: EntityKindEntry[];
  roles?: ReadonlyArray<OrgRole | string>;
}) {
  const { t } = useTranslation();
  const seen = new Set<EntityKind>();
  const unique = kinds.filter((k) => (seen.has(k.kind) ? false : (seen.add(k.kind), true)));
  const visibleRoles = [...new Set(roles)].filter((r) => !HIDDEN_ROLES.has(r));
  if (unique.length === 0 && visibleRoles.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="entity-kind-chips">
      {unique.map(({ kind, href }) => {
        const Icon = KIND_ICON[kind];
        const chip = (
          <Badge variant="secondary" className="gap-1.5" data-kind={kind}>
            <Icon size={12} aria-hidden="true" />
            {entityKindLabel(kind, t)}
          </Badge>
        );
        return href ? (
          <LocalizedLink key={kind} to={href} className="no-underline">
            {chip}
          </LocalizedLink>
        ) : (
          <span key={kind}>{chip}</span>
        );
      })}
      {visibleRoles.map((role) => (
        <Badge key={role} variant="outline">
          {orgRoleLabel(role, t)}
        </Badge>
      ))}
    </div>
  );
}
