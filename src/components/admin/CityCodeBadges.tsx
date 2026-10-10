import { badgeVariants } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { normalizeCode, regionImpliesCountry, type CityCodesInput } from '@/lib/cityCodes';

interface CityCodeBadgesProps extends CityCodesInput {
  className?: string;
}

/**
 * Chips are spans (not the div-based Badge) because they sit inside buttons
 * and combobox options.
 *
 * `[US-ME]` next to a city name in the admin — the region code already
 * names the country. `[US] [no region]` when the region is missing, and both
 * chips when the region's prefix contradicts the country. A missing code renders as
 * an explicit muted chip rather than nothing, so an un-backfilled city is
 * visibly different from one that simply has no twin.
 */
export function CityCodeBadges({ countryCode, regionCode, className }: CityCodeBadgesProps) {
  const country = normalizeCode(countryCode);
  const region = normalizeCode(regionCode);
  const showCountry = !regionImpliesCountry(country, region);
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1', className)}>
      {showCountry && (
        <CodeChip code={country} missingLabel="no country" title="Country (ISO 3166-1)" />
      )}
      <CodeChip
        code={region}
        missingLabel="no region"
        title="Region (ISO 3166-2)"
        missingTitle="No region_code yet — the region backfill has not resolved this city."
      />
    </span>
  );
}

function CodeChip({
  code,
  missingLabel,
  title,
  missingTitle,
}: {
  code: string | null;
  missingLabel: string;
  title: string;
  missingTitle?: string;
}) {
  if (!code) {
    return (
      <span
        title={missingTitle ?? `${title}: missing`}
        className={cn(
          badgeVariants({ variant: 'soft' }),
          'font-normal normal-case text-muted-foreground',
        )}
      >
        {missingLabel}
      </span>
    );
  }
  return (
    <span
      title={title}
      className={cn(badgeVariants({ variant: 'secondary' }), 'font-mono font-normal')}
    >
      {code}
    </span>
  );
}
