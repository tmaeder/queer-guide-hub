import { useTranslation } from 'react-i18next';
import { PageHero } from '@/components/discovery';
import { PageContainer } from '@/components/layout/PageContainer';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMeta } from '@/hooks/useMeta';
import { TECHNICAL_GROUPS, type TechnicalLink } from '@/config/technicalPages';

const linkKey = (href: string) => href.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '_');

function LinkRow({ link }: { link: TechnicalLink }) {
  const { t } = useTranslation();
  const key = linkKey(link.href);
  const label = t(`technical.links.${key}.label`, link.label);
  const className = 'font-bold text-foreground underline-offset-4 hover:underline';
  return (
    <li className="flex flex-col gap-1 py-4">
      {link.spa ? (
        <LocalizedLink to={link.href} className={className}>
          {label}
        </LocalizedLink>
      ) : (
        <a href={link.href} className={className}>
          {label}
        </a>
      )}
      <span className="text-13 text-muted-foreground">
        {t(`technical.links.${key}.description`, link.description)}
      </span>
    </li>
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
      <PageHero
        bare
        size="md"
        title={t('technical.title', 'Technical pages')}
        lede={t(
          'technical.lede',
          'The API, open data, methods, standards and tools behind Queer Guide, in one place.',
        )}
      />
      <div className="mt-10 grid gap-10 md:grid-cols-2">
        {TECHNICAL_GROUPS.map((group) => (
          <section key={group.id} aria-labelledby={`technical-${group.id}`}>
            <h2 id={`technical-${group.id}`} className="text-headline">
              {t(`technical.groups.${group.id}`, group.title)}
            </h2>
            <ul className="mt-2 divide-y divide-border">
              {group.links.map((link) => (
                <LinkRow key={link.href} link={link} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PageContainer>
  );
}
