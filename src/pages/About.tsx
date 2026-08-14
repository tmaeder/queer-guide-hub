import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { PageContainer } from '@/components/layout/PageContainer';
import { NetworkDiagram } from '@/components/about/NetworkDiagram';
import { HistoryLine } from '@/components/about/HistoryLine';
import { FactGrid } from '@/components/transit/FactGrid';
import { NestedEntityCard } from '@/components/transit/NestedEntityCard';
import { StationRing } from '@/components/transit/StationRing';
import { TransitIcon } from '@/components/transit/TransitIcon';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { useConsolidatedStats } from '@/hooks/useConsolidatedStats';

/**
 * /about, drawn as the network itself.
 *
 * The page is the system map: four lines converge in the masthead, the five
 * products are a line index (each carrying its own route bullet and track
 * colour), the history is a line with year-stations, and the CTA asks the
 * reader to extend it.
 *
 * Two rules govern the colour here. Every track fill is border-gated by 2–3px
 * of ink — blue, green and yellow all measure under 3:1 against paper on their
 * own — and no track colour encodes state anywhere on this page. The line index
 * showing all four at once is the sanctioned exception to "one accent per
 * context": a line index is the one surface where every line wears its colour.
 */

/** Section heading + kicker. Section h2 is `text-display`; card titles are
 *  `text-title`, two ranks down, so a card can never be mistaken for a heading. */
function SectionHead({
  kicker,
  title,
  lede,
  inverted = false,
}: {
  kicker?: string;
  title: string;
  lede?: string;
  inverted?: boolean;
}) {
  return (
    <header className="max-w-reading">
      {kicker && (
        <Eyebrow as="p" className={inverted ? 'text-background/70' : undefined}>
          {kicker}
        </Eyebrow>
      )}
      <h2 className="mt-2 text-headline leading-tight md:text-display">{title}</h2>
      {lede && (
        <p
          className={`mt-4 text-body-lg leading-relaxed ${
            inverted ? 'text-background/80' : 'text-muted-foreground'
          }`}
        >
          {lede}
        </p>
      )}
    </header>
  );
}

export default function About() {
  const { t } = useTranslation();
  const { stats, loading } = useConsolidatedStats();

  // `events` is the full 40k archive and 99% of it is in the past — the hook
  // says so in as many words. `events_upcoming` is the one a reader can act on.
  const statItems = useMemo(
    () => [
      { value: stats.venues, label: t('about.scale.venues', 'Venues') },
      { value: stats.events_upcoming, label: t('about.scale.events', 'Upcoming events') },
      { value: stats.cities, label: t('about.scale.cities', 'Cities') },
      { value: stats.countries, label: t('about.scale.countries', 'Countries') },
    ],
    [stats, t],
  );

  const lines: { key: string; type: string; to: string; name: string; description: string }[] = [
    {
      key: 'venues',
      type: 'venue',
      to: '/venues',
      name: t('about.lines.venues.name', 'Venues'),
      description: t(
        'about.lines.venues.description',
        'Queer-friendly bars, cafés, clubs and businesses, reviewed by real people.',
      ),
    },
    {
      key: 'events',
      type: 'event',
      to: '/events',
      name: t('about.lines.events.name', 'Events'),
      description: t(
        'about.lines.events.description',
        'Pride marches, drag shows, support groups, screenings — near you or anywhere.',
      ),
    },
    {
      key: 'marketplace',
      type: 'marketplace',
      to: '/marketplace',
      name: t('about.lines.marketplace.name', 'Marketplace'),
      description: t(
        'about.lines.marketplace.description',
        'LGBTQ+ owned businesses and creators. Shop where your money matters.',
      ),
    },
    {
      key: 'community',
      type: 'group',
      to: '/groups',
      name: t('about.lines.community.name', 'Community'),
      description: t(
        'about.lines.community.description',
        'Ask questions, share stories, find your people. Moderated, always.',
      ),
    },
    {
      key: 'places',
      type: 'city',
      to: '/places',
      name: t('about.lines.places.name', 'Places'),
      // NestedEntityCard clamps the description at 2 lines — keep these short
      // enough to land inside it rather than being cut mid-sentence.
      description: t(
        'about.lines.places.description',
        'Cities and countries: local laws, rights and safety notes before you go.',
      ),
    },
  ];

  const values: { key: string; icon: TransitIconName; title: string; description: string }[] = [
    {
      key: 'inclusivity',
      icon: 'rainbow',
      title: t('about.values.inclusivity.title', 'Inclusivity'),
      description: t(
        'about.values.inclusivity.description',
        'Every identity, every background, every story belongs here.',
      ),
    },
    {
      key: 'safety',
      icon: 'alerts',
      title: t('about.values.safety.title', 'Safety'),
      description: t(
        'about.values.safety.description',
        'Safe spaces online and off. It comes before everything else.',
      ),
    },
    {
      key: 'community',
      icon: 'community',
      title: t('about.values.community.title', 'Community'),
      description: t(
        'about.values.community.description',
        'Real connections between people and the organizations that serve them.',
      ),
    },
    {
      key: 'authenticity',
      icon: 'pride',
      title: t('about.values.authenticity.title', 'Authenticity'),
      description: t(
        'about.values.authenticity.description',
        'Be yourself. We built this so you never have to hide.',
      ),
    },
    {
      key: 'accessibility',
      icon: 'info-point',
      title: t('about.values.accessibility.title', 'Accessibility'),
      description: t(
        'about.values.accessibility.description',
        "We mark step-free entrances, accessible restrooms — and what's missing.",
      ),
    },
    {
      key: 'growth',
      icon: 'add-station',
      title: t('about.values.growth.title', 'Growth'),
      description: t(
        'about.values.growth.description',
        'Always changing, always listening. Built on what you tell us.',
      ),
    },
  ];

  const people = [
    {
      key: 'moderators',
      name: t('about.people.moderators.name', 'Community moderators'),
      role: t('about.people.moderators.role', 'Keeping it safe'),
      description: t(
        'about.people.moderators.description',
        'Volunteers who keep the platform welcoming and respectful, around the clock.',
      ),
    },
    {
      key: 'ambassadors',
      name: t('about.people.ambassadors.name', 'Local ambassadors'),
      role: t('about.people.ambassadors.role', 'Eyes on the ground'),
      description: t(
        'about.people.ambassadors.description',
        'Community leaders who surface local needs and champion inclusive spaces in their region.',
      ),
    },
    {
      key: 'contributors',
      name: t('about.people.contributors.name', 'Contributors'),
      role: t('about.people.contributors.role', 'Sharing knowledge'),
      description: t(
        'about.people.contributors.description',
        'Members who write reviews, post events and build the resources everyone else relies on.',
      ),
    },
  ];

  const getInvolved: {
    key: string;
    icon: TransitIconName;
    to: string;
    title: string;
    desc: string;
  }[] = [
    {
      key: 'addVenues',
      icon: 'add-station',
      to: '/venues/new',
      title: t('about.cta.addVenues.title', 'Add a venue'),
      desc: t('about.cta.addVenues.desc', 'Know a safe spot? Put it on the map.'),
    },
    {
      key: 'createEvents',
      icon: 'events',
      to: '/events/new',
      title: t('about.cta.createEvents.title', 'Post an event'),
      desc: t('about.cta.createEvents.desc', 'Organize something. Bring people together.'),
    },
    {
      key: 'joinGroups',
      icon: 'chat',
      to: '/groups',
      title: t('about.cta.joinGroups.title', 'Join a group'),
      desc: t('about.cta.joinGroups.desc', 'Your voice belongs in the conversation.'),
    },
    {
      key: 'support',
      icon: 'saved',
      to: '/donate',
      title: t('about.cta.support.title', 'Support us'),
      desc: t('about.cta.support.desc', 'Keep the platform free for everyone.'),
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Masthead */}
      <PageContainer as="section" className="pb-0">
        <Eyebrow variant="kicker" as="div">
          {t('about.eyebrow', 'About')}
        </Eyebrow>
        <h1 className="mt-6 text-hero leading-[0.95] md:text-hero-xl">
          {t('about.title', 'Built by queers, for everyone.')}
        </h1>
        <p className="mt-6 max-w-reading text-body-lg leading-relaxed text-muted-foreground">
          {t(
            'about.lede',
            'Queer Guide maps the places, events and people that make up queer life — verified by the community, free for everyone, everywhere in the world.',
          )}
        </p>
        <NetworkDiagram
          className="mt-10"
          label={t(
            'about.diagram.label',
            'Four lines — venues, events, community and places — converging on one station.',
          )}
        />
      </PageContainer>

      {/* Scale board — full-bleed ink band, content row takes the cap */}
      <div className="mt-12 bg-foreground text-background md:mt-16">
        <PageContainer>
          <Eyebrow as="p" className="text-background/70">
            {t('about.scale.kicker', 'The network today')}
          </Eyebrow>
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
            {statItems.map((stat) => (
              <div key={stat.label}>
                <dd className="font-display text-display leading-none tabular-nums md:text-hero">
                  {loading || typeof stat.value !== 'number' || stat.value <= 0
                    ? '—'
                    : `${stat.value.toLocaleString()}+`}
                </dd>
                <dt className="mt-2 text-2xs uppercase tracking-label text-background/70">
                  {stat.label}
                </dt>
              </div>
            ))}
          </dl>
        </PageContainer>
      </div>

      {/* Line index */}
      <PageContainer as="section">
        <SectionHead
          kicker={t('about.lines.kicker', 'The network')}
          title={t('about.lines.title', 'Five lines')}
          lede={t(
            'about.lines.lede',
            'Each part of the platform runs on its own line. Take whichever one you need.',
          )}
        />
        <ul className="m-0 mt-8 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {lines.map((line) => (
            <li key={line.key}>
              <NestedEntityCard
                type={line.type}
                name={line.name}
                description={line.description}
                href={line.to}
                actionLabel={t('about.lines.action', 'Open')}
              />
            </li>
          ))}
        </ul>
      </PageContainer>

      {/* Our story */}
      <PageContainer as="section" flush className="py-16 md:py-24">
        <div className="rule-heavy pt-10">
          <SectionHead
            kicker={t('about.story.kicker', 'Our story')}
            title={t('about.story.title', 'How this started')}
          />
          <div className="mt-8 flex max-w-reading flex-col gap-6">
            {/* No `.dek-dropcap` here: its `::first-letter { float: left }` is
                unconditional, so on /ar it would drop the cap at the END of the
                line. Not worth an RTL wart for one flourish. */}
            <p className="text-body-lg leading-relaxed">
              {t(
                'about.story.p1',
                "Finding a queer-friendly bar shouldn't take a group chat, three forum threads and a leap of faith. We started Queer Guide because we were tired of guessing which spaces were actually safe — and which just put a rainbow on the logo in June.",
              )}
            </p>
            <p className="text-body-lg leading-relaxed text-muted-foreground">
              {t(
                'about.story.p2',
                'A personal list of trusted venues turned into a global directory: verified by the community, built on real experience, free to use. Travelling solo, moving city, or just looking for somewhere to be on a Friday night — start here.',
              )}
            </p>
          </div>
        </div>
      </PageContainer>

      {/* Legend */}
      <PageContainer as="section" flush className="pb-16 md:pb-24">
        <SectionHead
          kicker={t('about.legend.kicker', 'Legend')}
          title={t('about.legend.title', 'What makes us different')}
        />
        <FactGrid
          className="mt-8"
          facts={[
            {
              label: t('about.legend.verified.label', 'Community-verified'),
              value: t(
                'about.legend.verified.body',
                'Every venue is reviewed by real LGBTQ+ people, not an algorithm.',
              ),
            },
            {
              label: t('about.legend.safety.label', 'Safety-first'),
              value: t(
                'about.legend.safety.body',
                'Local laws, rights and risk notes on every country page.',
              ),
            },
            {
              label: t('about.legend.free.label', 'Always free'),
              value: t(
                'about.legend.free.body',
                'No paywall, no premium tier. The platform belongs to everyone.',
              ),
            },
            {
              label: t('about.legend.global.label', 'Global reach'),
              value: t(
                'about.legend.global.body',
                'Berlin to Bangkok, São Paulo to Sydney — and growing.',
              ),
            },
          ]}
        />
      </PageContainer>

      {/* How we got here */}
      <PageContainer as="section" flush className="pb-16 md:pb-24">
        <SectionHead
          kicker={t('about.history.kicker', 'How we got here')}
          title={t('about.history.title', 'The line so far')}
          lede={t('about.history.lede', 'A side-project that became a global directory.')}
        />
        <HistoryLine
          className="mt-10"
          stops={[
            {
              year: t('about.history.y2021.year', '2021'),
              body: t(
                'about.history.y2021.body',
                'Three contributors, one spreadsheet. Safe bars in five European cities, shared in a Telegram group.',
              ),
            },
            {
              year: t('about.history.y2023.year', '2023'),
              body: t(
                'about.history.y2023.body',
                'A thousand venues across eighty cities. The events pipeline and the community submissions extension shipped.',
              ),
            },
            {
              year: t('about.history.y2025.year', '2025'),
              body: t(
                'about.history.y2025.body',
                'Tens of thousands of venues on every continent. Marketplace, trip planner, safety briefings and country-by-country rights.',
              ),
            },
            {
              year: t('about.history.y2026.year', '2026'),
              body: t(
                'about.history.y2026.body',
                'You are here. Add a venue, post an event, or join the contributor circle.',
              ),
            },
          ]}
        />
      </PageContainer>

      {/* What we value */}
      <PageContainer as="section" flush className="pb-16 md:pb-24">
        <SectionHead
          kicker={t('about.values.kicker', 'What we stand for')}
          title={t('about.values.title', 'What we value')}
        />
        <ul className="m-0 mt-8 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {values.map((value) => (
            <li
              key={value.key}
              className="flex h-full flex-col gap-2 border-[3px] border-foreground p-6"
            >
              <TransitIcon name={value.icon} size={32} className="text-foreground" />
              <h3 className="mt-2 text-title font-bold leading-tight">{value.title}</h3>
              <p className="text-13 leading-relaxed text-muted-foreground">{value.description}</p>
            </li>
          ))}
        </ul>
      </PageContainer>

      {/* The people behind it */}
      <PageContainer as="section" flush className="pb-16 md:pb-24">
        <SectionHead
          kicker={t('about.people.kicker', 'Who runs it')}
          title={t('about.people.title', 'The people behind it')}
          lede={t('about.people.lede', 'No corporation. Community members who give their time.')}
        />
        <ul className="m-0 mt-8 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-3">
          {people.map((member) => (
            <li key={member.key} className="border-[3px] border-foreground p-6">
              <p className="flex items-center gap-2">
                <StationRing state="done" />
                <span className="text-2xs uppercase tracking-label text-muted-foreground">
                  {member.role}
                </span>
              </p>
              <h3 className="mt-4 text-title font-bold leading-tight">{member.name}</h3>
              <p className="mt-2 text-13 leading-relaxed text-muted-foreground">
                {member.description}
              </p>
            </li>
          ))}
        </ul>
      </PageContainer>

      {/* Extend the line */}
      <div className="bg-foreground text-background">
        <PageContainer className="py-16 md:py-24">
          <SectionHead
            inverted
            title={t('about.cta.title', 'Help us extend the line.')}
            lede={t(
              'about.cta.body',
              'The network grows because people add to it. Every verified entry has someone behind it — add yours.',
            )}
          />

          <ul className="m-0 mt-10 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {getInvolved.map((item) => (
              <li key={item.key}>
                {/* On ink both the frame AND the lift shadow have to be paper —
                    `border-foreground` and the default ink `--shadow-hard` are
                    each invisible against this band. */}
                <LocalizedLink
                  to={item.to}
                  className="card-lift card-lift-invert flex h-full flex-col gap-2 border-[3px] border-background p-6 text-background no-underline"
                >
                  <TransitIcon name={item.icon} size={28} />
                  <span className="mt-2 text-title font-bold leading-tight">{item.title}</span>
                  <span className="text-13 leading-relaxed text-background/75">{item.desc}</span>
                </LocalizedLink>
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-wrap gap-2">
            {/* asChild, not a Link wrapping a Button — that nests a <button>
                inside an <a>, which is invalid HTML. */}
            <Button
              asChild
              size="lg"
              className="border-background bg-background text-foreground hover:opacity-90"
            >
              <LocalizedLink to="/submit" className="no-underline">
                {t('about.cta.primary', 'Submit a venue')}
              </LocalizedLink>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-background bg-transparent text-background hover:bg-background hover:text-foreground"
            >
              <LocalizedLink to="/contact" className="no-underline">
                {t('about.cta.secondary', 'Contact us')}
              </LocalizedLink>
            </Button>
          </div>
        </PageContainer>
      </div>
    </div>
  );
}
