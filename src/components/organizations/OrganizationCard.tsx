import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Image } from '@/components/ui/Image';
import { StationBadge } from '@/components/ui/StationBadge';
import { CardHoverEffect } from '@/components/effects/CardHoverEffect';
import { orgGlyph } from '@/lib/cardGlyphs';
import type { OrgListItem, OrgRole } from '@/hooks/useOrganization';

const ORG_ROLE_LABEL: Partial<Record<OrgRole, string>> = {
  support: 'Support organization',
  advocacy: 'Advocacy group',
  publisher: 'News outlet',
  seller: 'Shop',
  venue: 'Physical venue',
  organizer: 'Organiser',
  community: 'Community',
  hotel: 'Accommodation',
  brand: 'Brand',
  affiliate_partner: 'Partner',
};

/** `2011-04-01` / `2011` -> `2011`. Wikidata gives a full date; only the year is honest. */
function lifespanYear(value: string | null): string | null {
  const m = value?.match(/^(\d{4})/);
  return m ? m[1] : null;
}

/**
 * Directory card for an organization, in the same shape as every other card:
 * a plate on top (cover photo, else the logo on a paper ground, else the
 * station plate with the organization's role mark), the role mark on the seam
 * when there is a picture, then an eyebrow, the name and the blurb.
 */
export function OrganizationCard({ org }: { org: OrgListItem }) {
  const blurb = org.editorial_hook || org.description;
  const dissolved = lifespanYear(org.dissolved_at);
  const glyph = orgGlyph(org.roles);
  const src = org.cover_image_url || org.logo_url;
  const isLogo = !org.cover_image_url && !!org.logo_url;
  const roleLabels = org.roles.map((r) => ORG_ROLE_LABEL[r]).filter(Boolean) as string[];

  return (
    <CardHoverEffect>
      <Card hoverable="group" className="h-full overflow-hidden">
        <Image
          src={src}
          fit={isLogo ? 'contain' : 'cover'}
          plate={isLogo ? 'paper' : undefined}
          alt=""
          aspect="card"
          imageRole="cover"
          fallbackEntityType="default"
          fallbackKey={org.id}
          fallbackGlyph={glyph}
        />
        <div
          className={
            src
              ? 'flex flex-col gap-2 px-4 pb-4 group-has-[[data-fallback=station]]/card:pt-4'
              : 'flex flex-col gap-2 p-4'
          }
        >
          {/* With a picture the role mark sits on the seam; without one the
              plate already draws it. */}
          {src && <StationBadge glyph={glyph} className="-mt-8" />}
          {roleLabels.length > 0 && (
            <p className="truncate text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              {roleLabels.join(' · ')}
            </p>
          )}
          <h3 className="truncate text-title font-bold leading-tight">{org.name}</h3>
          {org.website_domain && (
            <p className="truncate text-xs text-muted-foreground">{org.website_domain}</p>
          )}
          {blurb && <p className="line-clamp-2 text-13 text-muted-foreground">{blurb}</p>}
          {/* A dissolved organization must say so on the card. Without this it
              reads as a body you can still contact — the reason dissolved rows
              are deranked in search rather than presented as live. */}
          {dissolved && (
            <div>
              <Badge variant="outline">Dissolved {dissolved}</Badge>
            </div>
          )}
        </div>
      </Card>
      {/* Card-wide click target — overlay sibling, never a wrapper (see EventCard). */}
      <LocalizedLink
        to={`/organizations/${org.slug}`}
        aria-label={org.name}
        className="absolute inset-0 rounded-container no-underline"
      />
    </CardHoverEffect>
  );
}
