import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TransitIcon } from '@/components/transit/TransitIcon';

export interface GeoOpeningLink {
  href: string;
  title: string;
  label: string;
  icon: 'events' | 'map';
}

export function GeoOpeningLinks({ links }: { links: GeoOpeningLink[] }) {
  const { t } = useTranslation();
  if (!links.length) return null;

  return (
    <ul
      aria-label={t('cities.opening.visit', 'Ideas for your visit')}
      className="grid min-w-0 gap-2 sm:grid-cols-2"
    >
      {links.map(({ href, title, label, icon }) => (
        <li key={href} className="min-w-0">
          <LocalizedLink
            to={href}
            className="group flex min-h-14 items-center gap-4 rounded-element bg-surface-container px-4 py-2 text-foreground no-underline"
          >
            <TransitIcon name={icon} size={18} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-muted-foreground">{label}</span>
              <span className="block break-words font-semibold group-hover:underline">{title}</span>
            </span>
            <TransitIcon name="arrow-right" size={16} className="shrink-0 rtl:rotate-180" />
          </LocalizedLink>
        </li>
      ))}
    </ul>
  );
}
