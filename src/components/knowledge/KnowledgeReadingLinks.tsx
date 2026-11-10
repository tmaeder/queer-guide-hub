import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowRight } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

export interface KnowledgeReadingLink {
  href: string;
  label: string;
}

export function KnowledgeReadingLinks({ links }: { links: KnowledgeReadingLink[] }) {
  const { t } = useTranslation();
  if (!links.length) return null;

  const linkClass =
    'inline-flex min-h-11 max-w-full items-center gap-2 rounded-element border border-border px-4 py-2 text-sm font-semibold text-foreground no-underline underline-offset-4 hover:bg-muted hover:underline';

  return (
    <nav aria-label={t('knowledge.readingLinks', 'Related guides and resources')}>
      <ul className="flex flex-wrap gap-2">
        {links.map(({ href, label }) => (
          <li key={href} className="min-w-0">
            {href.startsWith('#') ? (
              <a href={href} className={linkClass}>
                <span className="break-words">{label}</span>
                <ArrowDown size={16} aria-hidden="true" className="shrink-0" />
              </a>
            ) : (
              <LocalizedLink to={href} className={linkClass}>
                <span className="break-words">{label}</span>
                <ArrowRight size={16} aria-hidden="true" className="shrink-0 rtl:rotate-180" />
              </LocalizedLink>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
