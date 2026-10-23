import { ExternalLink } from 'lucide-react';
import { CityCodeBadges } from '@/components/admin/CityCodeBadges';
import { toWebsiteHref } from '@/lib/websiteHref';

type Embed<T> = T | T[] | null | undefined;

function one<T>(value: Embed<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Org list "Location" cell: city name plus its ISO codes ("Basel [CH-BS]").
 * Reads the `cities(name,region_code)` / `countries(code)` embeds from the
 * list select. A row with no linked city still shows its country code, so an
 * unlinked org reads differently from a linked one.
 */
export function OrganizationLocationCell({ row }: { row: Record<string, unknown> }) {
  const city = one(row.cities as Embed<{ name?: string | null; region_code?: string | null }>);
  const country = one(row.countries as Embed<{ code?: string | null }>);
  if (!city && !country) return null;
  return (
    <span className="inline-flex items-center gap-2">
      {city?.name && <span>{city.name}</span>}
      <CityCodeBadges countryCode={country?.code ?? null} regionCode={city?.region_code ?? null} />
    </span>
  );
}

/** Org list "Web" cell: an icon link to the website, nothing when there is none. */
export function OrganizationWebsiteCell({ row }: { row: Record<string, unknown> }) {
  const href = toWebsiteHref(row.website);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open website: ${href}`}
      title={href}
      className="inline-flex text-muted-foreground hover:text-foreground"
      onClick={(e) => e.stopPropagation()}
    >
      <ExternalLink size={16} aria-hidden="true" />
    </a>
  );
}
