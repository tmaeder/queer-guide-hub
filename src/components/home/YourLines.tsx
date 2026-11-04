import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { recentlyViewedHref } from '@/lib/recentlyViewed';
import { Band } from './Band';

export function YourLines() {
  const { t } = useTranslation();
  const recent = useRecentlyViewed();

  if (recent.length === 0) return null;

  const seen = new Set<string>();
  const entries = recent
    .filter((item) => {
      const key = recentlyViewedHref(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);

  return (
    <Band title={t('home.discovery.recent', 'Recently viewed')}>
      <ul className="m-0 grid list-none gap-x-6 p-0 sm:grid-cols-3">
        {entries.map((item) => (
          <li key={`${item.type}:${item.slug}`} className="border-t border-border-hairline">
            <LocalizedLink
              to={recentlyViewedHref(item)}
              className="flex min-h-12 items-center break-words py-2 font-bold"
            >
              {item.title}
            </LocalizedLink>
          </li>
        ))}
      </ul>
    </Band>
  );
}
