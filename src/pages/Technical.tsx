import { useTranslation } from 'react-i18next';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { RouteBullet } from '@/components/transit/RouteBullet';
import type { Track } from '@/components/transit/routeBulletMap';
import type { TransitIconName } from '@/components/transit/transitIconPaths';
import { useMeta } from '@/hooks/useMeta';
import { TECHNICAL_GROUPS, type TechnicalLink } from '@/config/technicalPages';

// One line per group, the way the legal hub gives each policy its own line.
const GROUP_LINES: Record<string, { track: Track | 'ink'; icon: TransitIconName }> = {
  api: { track: 'blue', icon: 'share' },
  data: { track: 'green', icon: 'library' },
  methods: { track: 'yellow', icon: 'scales' },
  standards: { track: 'pink', icon: 'documents' },
  tools: { track: 'ink', icon: 'tune' },
};

const linkKey = (href: string) => href.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '_');

const CARD_CLASS =
  'card-lift group flex h-full items-start gap-4 bg-card p-6 text-inherit no-underline rounded-container shadow-soft';

function LinkCard({ link, groupId }: { link: TechnicalLink; groupId: string }) {
  const { t } = useTranslation();
  const key = linkKey(link.href);
  const line = GROUP_LINES[groupId];
  const body = (
    <>
      <RouteBullet type="page" icon={line.icon} track={line.track} decorative size={38} />
      <div className="min-w-0 flex-1">
        <h3 className="text-title font-bold leading-tight">
          {t(`technical.links.${key}.label`, link.label)}
        </h3>
        <p className="mt-1 text-13 leading-relaxed text-muted-foreground">
          {t(`technical.links.${key}.description`, link.description)}
        </p>
      </div>
    </>
  );
  // Non-SPA targets (middleware pages, Functions, static files) need a full load.
  return link.spa ? (
    <LocalizedLink to={link.href} className={CARD_CLASS}>
      {body}
    </LocalizedLink>
  ) : (
    <a href={link.href} className={CARD_CLASS}>
      {body}
    </a>
  );
}

export default function Technical() {
  const { t } = useTranslation();
  useMeta({
    title: t('technical.metaTitle', 'Technical pages | Queer Guide'),
    description: t(
      'technical.metaDescription',
      'The Queer Guide API, open data, methods, standards and tools in one place.',
    ),
  });

  return (
    <PageContainer>
      <header className="border-b border-border-hairline pb-6">
        <h1 className="font-display text-display leading-none tracking-tight md:text-hero">
          {t('technical.title', 'Technical pages')}
        </h1>
        <p className="mt-4 max-w-2xl text-body-lg text-muted-foreground">
          {t(
            'technical.lede',
            'The API, open data, methods, standards and tools behind Queer Guide, in one place.',
          )}
        </p>
      </header>

      {TECHNICAL_GROUPS.map((group) => (
        <section key={group.id} className="mt-12" aria-labelledby={`technical-${group.id}`}>
          <h2 id={`technical-${group.id}`} className="font-display text-headline leading-tight">
            {t(`technical.groups.${group.id}`, group.title)}
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {group.links.map((link) => (
              <li key={link.href}>
                <LinkCard link={link} groupId={group.id} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="mt-12 overflow-hidden rounded-container bg-foreground p-6 text-background">
        <p className="text-2xs font-bold uppercase tracking-label text-background/70">
          {t('technical.endOfLine', 'End of line')}
        </p>
        <p className="mt-2 text-13 leading-relaxed text-background/80">
          {t('technical.questions', 'Questions about the API or the data?')}{' '}
          <LocalizedLink to="/contact" className="font-bold text-background">
            {t('technical.contactUs', 'Contact us')}
          </LocalizedLink>
          .
        </p>
      </section>
    </PageContainer>
  );
}
