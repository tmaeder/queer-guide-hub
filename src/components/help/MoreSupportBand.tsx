/**
 * MoreSupportBand — everything a researcher needs, in one band.
 *
 * Merges four blocks that were ~40% of the old page's scroll height: the
 * support-org grid, the "know the law" block, the related-resource chips and
 * the coverage note. The chips are gone entirely — they pointed at
 * /resources?category=… which the per-card topic chips already do
 * contextually, so it was two controls for one destination.
 *
 * "Helping someone else" is new here, but the copy is not: it was the third
 * paragraph of the CMS prose blob near the top of the old page — the only part
 * of that blob that was not a verbatim duplicate of the emergency banner or the
 * disclaimer, and the page's only copy addressed to a friend, teacher or case
 * worker rather than to someone in crisis. It was buried in German-first HTML
 * in position nine.
 */

import { useTranslation } from 'react-i18next';
import { Building2, ChevronRight } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { CoverageNote } from '@/components/intent/CoverageNote';

interface SupportOrg {
  id: string;
  slug: string;
  name: string;
  logo_url?: string | null;
  website_domain?: string | null;
}

const ACTION =
  'mt-4 inline-flex min-h-11 items-center gap-1 self-start px-4 py-2 text-13 font-bold no-underline hover:bg-foreground hover:text-background';

export function MoreSupportBand({ orgs }: { orgs: SupportOrg[] }) {
  const { t } = useTranslation();

  return (
    <section className="mt-12 border-t border-border-hairline pt-8" aria-labelledby="help-more">
      <h2 id="help-more" className="font-display text-headline leading-tight">
        {t('help.more_support', 'More support')}
      </h2>

      <div className="mt-8 grid border-y border-border-hairline md:grid-cols-3 md:divide-x md:divide-border-hairline">
        <div className="py-8 md:pr-8">
          <h3 className="text-title font-bold leading-tight">
            {t('help.support_orgs', 'Support organizations')}
          </h3>
          <p className="mt-4 max-w-prose text-13 leading-relaxed text-muted-foreground">
            {t(
              'help.support_orgs_body',
              'Community centres and advocacy groups that offer in-person support.',
            )}
          </p>
          {orgs.length > 0 && (
            <ul className="m-0 mt-6 list-none border-t border-border-hairline p-0">
              {orgs.slice(0, 3).map((org) => (
                <li key={org.id} className="border-b border-border-hairline last:border-b-0">
                  <LocalizedLink
                    to={`/organizations/${org.slug}`}
                    className="flex min-h-12 items-center gap-4 py-2 text-inherit no-underline hover:underline"
                  >
                    {org.logo_url ? (
                      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-badge bg-muted">
                        <Building2 size={14} aria-hidden />
                        <img
                          src={org.logo_url}
                          alt=""
                          className="absolute inset-0 h-full w-full bg-background object-contain"
                          onError={(event) => {
                            event.currentTarget.hidden = true;
                          }}
                        />
                      </span>
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-badge bg-muted">
                        <Building2 size={14} aria-hidden />
                      </span>
                    )}
                    <span className="min-w-0 text-13 font-bold">{org.name}</span>
                  </LocalizedLink>
                </li>
              ))}
            </ul>
          )}
          <LocalizedLink to="/organizations?role=support" className={ACTION}>
            {t('help.browse_support_orgs', 'Browse all support organizations')}
            <ChevronRight size={14} aria-hidden />
          </LocalizedLink>
        </div>

        <div className="border-t border-border-hairline py-8 md:border-t-0 md:px-8">
          <h3 className="text-title font-bold leading-tight">
            {t('help.know_the_law', 'Know the law')}
          </h3>
          <p className="mt-4 max-w-prose text-13 leading-relaxed text-muted-foreground">
            {t(
              'help.know_the_law_body',
              'Whether it is safe to be out, to seek healthcare, or to report a crime depends on where you are. Check the legal position before you act on it.',
            )}
          </p>
          <LocalizedLink to="/rights" className={ACTION}>
            {t('help.rights_by_country', 'LGBTQ+ rights by country')}
            <ChevronRight size={14} aria-hidden />
          </LocalizedLink>
        </div>

        <div className="border-t border-border-hairline py-8 md:border-t-0 md:pl-8">
          <h3 className="text-title font-bold leading-tight">
            {t('help.helping_title', 'Helping someone else')}
          </h3>
          <p className="mt-4 max-w-prose text-13 leading-relaxed text-muted-foreground">
            {t(
              'help.helping_body',
              'If you are listening to someone in crisis: stay with them, take what they say seriously, and do not leave them alone. You do not have to have the answers. Call a line together, or call one yourself to ask what to do next.',
            )}
          </p>
          <LocalizedLink to="/resources?category=Mental+Health" className={ACTION}>
            {t('help.browse_resources', 'Browse all resources')}
            <ChevronRight size={14} aria-hidden />
          </LocalizedLink>
        </div>
      </div>

      {/* Ungated. This used to sit inside `orgs.length > 0`, so the note that
          exists to explain an empty result vanished exactly when the result was
          empty — which is every time geo resolution fails. */}
      <div className="mt-6">
        <CoverageNote>
          {t(
            'help.org_coverage',
            'This directory is nowhere near everywhere. If a group you trust is missing, tell us about it. An empty result here means we have no record — not that no help exists.',
          )}{' '}
          <LocalizedLink to="/submit" className="underline underline-offset-4">
            {t('help.tell_us', 'Tell us about it')}
          </LocalizedLink>
        </CoverageNote>
      </div>
    </section>
  );
}
