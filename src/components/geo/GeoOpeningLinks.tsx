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
      className="min-w-0 divide-y divide-border-hairline"
    >
      {links.map(({ href, title, label, icon }) => (
        <li key={href} className="min-w-0">
          <LocalizedLink
            to={href}
            className="group flex min-h-14 items-center gap-4 py-2 text-foreground no-underline"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-container-high">
              <TransitIcon name={icon} size={18} />
            </span>
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
