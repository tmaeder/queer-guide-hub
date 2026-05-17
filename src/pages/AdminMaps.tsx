import { useTranslation } from 'react-i18next';
import { MapShell } from '@/components/map/MapShell';

/**
 * Admin map view — geographic visualization of ingestion + content state.
 *
 * Uses the shared <MapShell surface="admin"> with Density lens by default so
 * editors can see where venue/event coverage is thin at a glance. Filters
 * (category, time) and the layer toggle expose the same data planes the
 * public map uses; URL state lets editors share a specific view.
 */
export default function AdminMaps() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('admin.maps.title', { defaultValue: 'Maps' })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('admin.maps.description', {
            defaultValue:
              'Geographic view of platform content. Switch lenses to see density, individual entities, or boundaries.',
          })}
        </p>
      </header>
      <div className="border border-border" style={{ height: 'calc(100dvh - 200px)' }}>
        <MapShell surface="admin" height="100%" />
      </div>
    </div>
  );
}
