import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { IntentPageLayout } from '@/components/intent/IntentPageLayout';
import { CoverageNote } from '@/components/intent/CoverageNote';
import { useIntentLocation } from '@/hooks/useIntentLocation';
import { useOrganizationsList } from '@/hooks/useOrganization';
import type { SectionDef } from '@/components/entity/editorial';

/**
 * `/support` — helplines and organizations near you.
 *
 * Named "Support", not "Support me": the latter reads as an account or billing
 * page and collides head-on with `/donate`, where "Support us" already lives.
 *
 * Two safety decisions, both deliberate:
 *
 *  - The crisis band renders SYNCHRONOUSLY with hardcoded English text, before
 *    i18n or any query resolves. Someone arriving here in crisis must never see
 *    a skeleton where a phone number belongs. This mirrors the same constraint
 *    on HelpHotlines.tsx.
 *  - This page ships `HideScreen` but NOT `QuickExit`. QuickExit binds a global
 *    Escape handler that replaces `location` and scrubs the back stack — on a
 *    page with a country picker and dialogs, Escape means "close this", and
 *    silently ejecting someone to another site instead would be both surprising
 *    and, for a user mid-task, alarming. `/help` keeps QuickExit; the escape
 *    hatch there is the whole point of the page.
 */
export default function SupportIntent() {
  const { t } = useTranslation();
  const { countryCode, loading: locLoading } = useIntentLocation();

  const { data: orgs, isLoading } = useOrganizationsList({
    role: 'support',
    countryCode: countryCode ?? undefined,
    limit: 24,
    enabled: !locLoading,
  });

  useMeta({
    title: 'Find LGBTQ+ support near you',
    description:
      'Support organizations, advocacy groups and crisis helplines for LGBTQ+ people, listed by country with direct links.',
    canonicalPath: '/support',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'LGBTQ+ support organizations',
    },
  });

  const sections: SectionDef[] = [
    {
      id: 'near-you',
      label: 'Near you',
      kicker: countryCode ? `Organizations in ${countryCode}` : 'Support organizations',
      // `isLoading || locLoading`, not `isLoading` alone. The query is
      // `enabled: !locLoading`, and in react-query v5 a DISABLED query reports
      // `isLoading === false` (isLoading = isPending && isFetching). So while
      // the location was still resolving, this fell straight past the loading
      // branch into the empty state and told the reader "We have no support
      // organizations listed for your country yet" before it had asked —  on
      // the page someone reaches in a crisis. GoingOut.tsx:64 and People.tsx:144
      // already use the combined guard; Support was the outlier.
      content:
        isLoading || locLoading ? (
          <p className="text-muted-foreground">Loading organizations…</p>
        ) : orgs && orgs.length > 0 ? (
          <ul className="list-none p-0 m-0 grid gap-4 sm:grid-cols-2">
            {orgs.map((o) => (
              <li key={o.id} className="border-2 border-foreground p-4 rounded-container">
                <h3 className="font-display text-title mb-1">
                  {o.slug ? (
                    <LocalizedLink
                      to={`/organizations/${o.slug}`}
                      className="no-underline hover:underline"
                    >
                      {o.name}
                    </LocalizedLink>
                  ) : (
                    o.name
                  )}
                </h3>
                {o.description ? (
                  <p className="text-13 text-muted-foreground line-clamp-3">{o.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div>
            <p className="text-muted-foreground mb-4">
              We have no support organizations listed for your country yet.
            </p>
            <LocalizedLink to="/organizations" className="underline underline-offset-4">
              Browse every organization
            </LocalizedLink>
          </div>
        ),
      action: (
        <LocalizedLink
          to="/organizations?role=support"
          className="text-13 no-underline hover:underline"
        >
          All organizations
        </LocalizedLink>
      ),
    },
    {
      id: 'coverage',
      label: 'What we cover',
      content: (
        <CoverageNote>
          We list 2,510 organizations across 76 countries. That is nowhere near everywhere — if a
          group you trust is missing,{' '}
          <LocalizedLink to="/submit" className="underline underline-offset-4">
            tell us about it
          </LocalizedLink>
          . An empty result here means we have no record, not that no help exists.
        </CoverageNote>
      ),
    },
    {
      id: 'rights',
      label: 'Know the law',
      content: (
        <div>
          <p className="mb-4 max-w-prose">
            Whether it is safe to be out, to seek healthcare, or to report a crime depends on where
            you are. Check the legal position before you act on it.
          </p>
          <LocalizedLink
            to="/rights"
            className="border-2 border-foreground px-6 py-2 font-medium no-underline rounded-element inline-block"
          >
            LGBTQ+ rights by country
          </LocalizedLink>
        </div>
      ),
    },
  ];

  return (
    <IntentPageLayout
      breadcrumbLabel={t('header.intents.support.label', 'Support')}
      breadcrumbHref="/support"
      eyebrow="You are not alone"
      title="Find support near you"
      lede="Helplines, advocacy groups and community organizations, listed by country."
      scopeBar={
        // Rendered synchronously, above everything that loads. A person in
        // crisis must reach a phone number without waiting for a query.
        <div className="border-2 border-foreground p-6 rounded-container">
          <p className="font-display text-title mb-2">In crisis right now?</p>
          <p className="text-muted-foreground mb-4">
            If you are in immediate danger, call your local emergency number first. For confidential
            LGBTQ+ crisis lines by country:
          </p>
          <LocalizedLink
            to="/help"
            className="border-2 border-foreground px-6 py-2 font-medium no-underline rounded-element inline-block"
          >
            Crisis hotlines
          </LocalizedLink>
        </div>
      }
      sections={sections}
      disableProgress
    />
  );
}
