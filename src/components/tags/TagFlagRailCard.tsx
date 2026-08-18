/**
 * TagFlagRailCard — the compact flag card on an IDENTITY tag page
 * (/tags/lesbian shows the lesbian flag; /tags/gay shows rainbow + the gay
 * men's flag). Self-selecting from `flagsForIdentityTag`; links through to
 * the flag's own tag page where the full band lives.
 */

import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { SidebarCard } from '@/components/transit/SidebarCard';
import { FlagSwatch } from '@/components/tags/FlagSwatch';
import { flagsForIdentityTag } from '@/lib/flags';

export function TagFlagRailCard({ tagSlug }: { tagSlug: string }) {
  const { t } = useTranslation();
  const flags = flagsForIdentityTag(tagSlug);
  if (flags.length === 0) return null;

  return (
    <SidebarCard
      eyebrow={
        flags.length > 1
          ? t('tags.detail.flag.railPlural', 'Flags')
          : t('tags.detail.flag.railSingular', 'Flag')
      }
    >
      <ul className="list-none space-y-4 p-0">
        {flags.map((flag) => {
          const name = t(flag.nameKey, flag.nameEn);
          const body = (
            <>
              <FlagSwatch flag={flag} decorative />
              <span className="mt-2 block text-13 font-bold leading-tight">
                {name}
                {flag.year && (
                  <span className="ml-2 font-normal text-muted-foreground">{flag.year}</span>
                )}
              </span>
            </>
          );
          return (
            <li key={flag.id}>
              {flag.flagTagSlug ? (
                <LocalizedLink
                  to={`/tags/${encodeURIComponent(flag.flagTagSlug)}`}
                  className="block no-underline"
                  aria-label={name}
                >
                  {body}
                </LocalizedLink>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </SidebarCard>
  );
}
