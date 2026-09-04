import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { useStiProfile } from '@/hooks/useStiProfile';
import { transmissionRiskVisual } from '@/lib/stiRisk';
import { RiskMark } from '@/components/health/RiskMark';

/**
 * The sexual-health band on an STI tag page: how it spreads (worst route
 * first), when a test can detect it, and what protects against it.
 *
 * SELF-SELECTING: `get_tag_sti_profile` returns null for every tag without an
 * STI profile, so nothing in the UI decides "is this an STI" — presence of
 * data is the signal, same as the diagnostic-codes band.
 *
 * ORDER IS THE SAFETY FEATURE: transmission routes arrive worst-first from
 * the RPC (`sti_risk_rank`), and the highest-risk route must be the first
 * thing on screen. Absence of a route is stated out loud — an empty row reads
 * as "safe", which is not what absence means.
 *
 * Every risk level renders tint + ink border + icon + label; the blood
 * droplet is a modifier marker beside the icon, never a colour.
 */

interface Props {
  tagId: string;
  tagName: string;
}

export function StiProfile({ tagId, tagName }: Props) {
  const { t } = useTranslation();
  const { data: profile, isLoading } = useStiProfile(tagId);

  if (isLoading || !profile) return null;

  const groupLabels: Record<string, string> = {
    anorectal: t('tags.sti.group.anorectal', 'Anal sex & play'),
    oral_touching: t('tags.sti.group.oral', 'Oral & touching'),
    chems: t('tags.sti.group.chems', 'Chems'),
    vaginal: t('tags.sti.group.vaginal', 'Vaginal sex'),
  };

  return (
    <section className="border border-border-hairline">
      <header className="border-b border-border-hairline bg-foreground px-4 py-4 text-background">
        <Eyebrow className="text-background/70">{t('tags.sti.eyebrow', 'Sexual health')}</Eyebrow>
        <h2 className="mt-1 text-title font-bold">
          {t('tags.sti.title', '{{name}}: spread, testing, protection', { name: tagName })}
        </h2>
        <p className="mt-1 text-13 text-background/70">
          {profile.pathogen === 'virus'
            ? t('tags.sti.virus', 'Viral infection')
            : t('tags.sti.bacteria', 'Bacterial infection')}
        </p>
      </header>

      {/* ── How it spreads ──────────────────────────────────────────────── */}
      <div className="p-4">
        <h3 className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
          {t('tags.sti.transmission', 'How it spreads (unprotected)')}
        </h3>
        {/* The mark is `RiskMark` and the practice is text beside it, rather
            than one tinted chip carrying both. Two reasons: the fill's ink
            border is a contract that now lives in exactly one component (this
            block used to draw `border-width: 0` while the file header claimed
            "tint + ink border"), and it makes this band read identically to the
            per-infection blocks on /tags/sti-guide — same mark, same order,
            same grammar, so a reader meets one visual language on both. */}
        <ul className="m-0 mt-4 list-none p-0">
          {profile.transmission.map((route) => {
            const v = transmissionRiskVisual(route.risk);
            return (
              <li
                key={route.practice}
                className="flex items-center gap-2 border-b border-border-hairline py-2 last:border-b-0"
              >
                {/* `describedByRow`: the level is visible text at the end of
                    this row, so naming the mark too made every row announce
                    "High risk High risk". */}
                <RiskMark risk={route.risk} blood={route.blood} size="sm" describedByRow className="shrink-0" />
                <span className="text-13 font-bold">{route.label}</span>
                <span className="ml-auto text-2xs font-bold uppercase tracking-label text-muted-foreground">
                  {v.label}
                  {/* The blood modifier is VISIBLE text, not an sr-only string
                      hanging off the icon. It used to be announced as a bare
                      em-dash fragment before the practice name, and sighted
                      readers got only a droplet — colour and glyph alone
                      carrying a meaning (WCAG 1.4.1). Now both get the words. */}
                  {route.blood && (
                    <span className="text-muted-foreground">
                      {' · '}
                      {t('tags.sti.bloodShort', 'with blood')}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-13 leading-relaxed text-muted-foreground">
          {t(
            'tags.sti.absence',
            'A practice that is not listed is one this data says nothing about — not a documented route, which is not the same as no risk. Grouped: {{groups}}.',
            {
              groups: Array.from(new Set(profile.transmission.map((r) => groupLabels[r.group])))
                .filter(Boolean)
                .join(', '),
            },
          )}
        </p>
      </div>

      {/* ── When to test ────────────────────────────────────────────────── */}
      <div className="border-t border-border-hairline p-4">
        <h3 className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
          {t('tags.sti.testing', 'When to test')}
        </h3>
        <ul className="mt-2 list-none p-0">
          {profile.testing.map((w, i) => (
            <li
              key={i}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-hairline py-2 last:border-b-0"
            >
              <span className="text-13 font-bold">{w.test_kind}</span>
              <span className="text-13 text-muted-foreground">
                {w.symptoms_only
                  ? t('tags.sti.symptomsOnly', 'when symptoms are present')
                  : t('tags.sti.fromWeeks', 'reliable from {{n}} weeks after the risk', {
                      n: w.earliest_weeks,
                    })}
                {' · '}
                {t('tags.sti.sample', 'sample: {{sample}}', { sample: w.sample })}
              </span>
              {w.note && (
                <span className="w-full text-13 leading-relaxed text-muted-foreground">
                  {w.note}
                </span>
              )}
            </li>
          ))}
        </ul>
        {profile.vaccine_note && (
          <p className="mt-4 bg-muted rounded-element p-2 text-13 font-bold">
            {t('tags.sti.vaccine', 'Vaccine')}:{' '}
            <span className="font-normal">{profile.vaccine_note}</span>
          </p>
        )}
      </div>

      {/* ── Protection ──────────────────────────────────────────────────── */}
      <div className="border-t border-border-hairline p-4">
        <h3 className="text-2xs font-bold uppercase tracking-label text-muted-foreground">
          {t('tags.sti.protection', 'What protects against it')}
        </h3>
        <ul className="mt-2 list-none p-0">
          {profile.protection.map((m) => (
            <li key={m.slug} className="border-b border-border-hairline py-2 last:border-b-0">
              <span className="text-13 font-bold">{m.label}</span>
              <p className="mt-1 text-13 leading-relaxed text-muted-foreground">{m.description}</p>
            </li>
          ))}
        </ul>
      </div>

      <footer className="border-t border-border-hairline p-4">
        <LocalizedLink
          to="/tags/sti-guide"
          className="inline-block px-4 py-2 text-13 font-bold text-foreground no-underline transition-colors hover:bg-foreground hover:text-background"
        >
          {t('tags.sti.seeAll', 'See the full STI guide')}
        </LocalizedLink>
        <p className="mt-4 text-13 leading-relaxed text-muted-foreground">
          {t(
            'tags.sti.disclaimer',
            'A quick reference, not medical advice. Find a testing location near you at',
          )}{' '}
          <a href="https://testfinder.info/" target="_blank" rel="noopener noreferrer">
            testfinder.info
          </a>
          .
        </p>
        <p className="mt-2 text-2xs uppercase tracking-label text-muted-foreground">
          {t('tags.sti.credit', 'Based on')}{' '}
          <a href={profile.source_url} target="_blank" rel="noopener noreferrer">
            {profile.source}
          </a>
        </p>
      </footer>
    </section>
  );
}
