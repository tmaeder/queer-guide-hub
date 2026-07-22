import { useTranslation } from 'react-i18next';
import { HISTORY_ERAS } from '@/config/historyEras';

/**
 * Sticky chapter navigation for /history — era title + filtered count chips
 * anchoring to #era-{slug}. Plain anchors, no scroll-spy.
 */
export function EraJumpNav({ counts }: { counts: Map<string, number> | undefined }) {
  const { t } = useTranslation();
  const visible = HISTORY_ERAS.filter((e) => (counts?.get(e.slug) ?? 1) > 0);
  if (visible.length < 2) return null;
  return (
    <nav
      aria-label={t('milestones.eraNav', 'Jump to era')}
      className="sticky top-[56px] z-10 -mx-4 mb-8 border-b border-border bg-background px-4 md:top-[64px]"
    >
      <div className="no-scrollbar flex gap-2 overflow-x-auto py-2">
        {visible.map((era) => (
          <a
            key={era.slug}
            href={`#era-${era.slug}`}
            className="shrink-0 rounded-badge border border-border px-2 py-1 text-13 text-muted-foreground hover:border-foreground hover:text-foreground"
          >
            {t(era.titleKey)}
            {counts ? (
              <span className="ml-1 text-2xs text-muted-foreground">{counts.get(era.slug)}</span>
            ) : null}
          </a>
        ))}
      </div>
    </nav>
  );
}
