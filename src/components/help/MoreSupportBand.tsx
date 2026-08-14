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

const COLUMN = 'flex min-w-0 flex-col border-[3px] border-foreground bg-background p-6';
const ACTION =
  'mt-4 inline-flex items-center gap-1 self-start border-2 border-foreground px-4 py-2 text-13 font-bold no-underline transition-colors hover:bg-foreground hover:text-background';

export function MoreSupportBand({ orgs }: { orgs: SupportOrg[] }) {
  const { t } = useTranslation();

  return (
    <section className="mt-12 border-t-4 border-foreground pt-8" aria-labelledby="help-more">
      <h2 id="help-more" className="font-display text-display leading-tight">
        {t('help.more_support', 'More support')}
      </h2>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className={COLUMN}>
          <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
            {t('help.support_orgs', 'Support organizations')}
          </p>
          <p className="mt-2 text-13 leading-relaxed text-muted-foreground">
            {t(
              'help.support_orgs_body',
              'Community centres and advocacy groups that offer in-person support.',
            )}
          </p>
          {orgs.length > 0 && (
            <ul className="m-0 mt-4 list-none border-t-2 border-foreground/10 p-0">
              {orgs.slice(0, 4).map((org) => (
                <li key={org.id} className="border-b-2 border-foreground/10 last:border-b-0">
                  <LocalizedLink
                    to={`/organizations/${org.slug}`}
                    className="card-lift-sm flex items-center gap-2 py-2 text-inherit no-underline"
                  >
                    {org.logo_url ? (
                      <img
                        src={org.logo_url}
                        alt=""
                        className="h-8 w-8 shrink-0 border-2 border-foreground object-contain"
                      />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-foreground">
                        <Building2 size={14} aria-hidden />
                      </span>
                    )}
                    <span className="min-w-0 truncate text-13 font-bold">{org.name}</span>
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

        <div className={COLUMN}>
          <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
            {t('help.know_the_law', 'Know the law')}
          </p>
          <p className="mt-2 text-13 leading-relaxed text-muted-foreground">
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

        <div className={COLUMN}>
          <p className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
            {t('help.helping_title', 'Helping someone else')}
          </p>
          <p className="mt-2 text-13 leading-relaxed text-muted-foreground">
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
