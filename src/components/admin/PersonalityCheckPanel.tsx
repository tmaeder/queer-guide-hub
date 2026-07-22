import { useMemo } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Cake, Flame, Award, ImageOff, FileQuestion } from 'lucide-react';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { usePersonalityAnniversaries } from '@/hooks/usePersonalityAnniversaries';
import { useRiskVisual } from '@/hooks/useRiskVisual';
import { AMPEL_RISK, type AmpelTone } from '@/lib/personalityStatus';

/**
 * Personencheck panel — a PHP-tool-style dashboard header above the personalities
 * admin list: KPI tiles (with an at-a-glance ampel) + an upcoming birth/death
 * anniversary stream. Monochrome except the sanctioned traffic-light dots.
 */

const nf = (n: number) => n.toLocaleString('de-DE');

async function headCount(build: (q: ReturnType<typeof baseQuery>) => unknown): Promise<number> {
  const q = baseQuery();
  const { count } = (await build(q)) as { count: number | null };
  return count ?? 0;
}
const baseQuery = () =>
  untypedFrom('personalities').select('*', { count: 'exact', head: true });

function useCounts() {
  return useQuery({
    queryKey: ['personality-check-counts'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [total, approved, manuallyVerified, pending, archived, publicVis, noImage, noSource, deceased] =
        await Promise.all([
          headCount((q) => q),
          headCount((q) => q.eq('review_status', 'approved')),
          headCount((q) => q.eq('review_status', 'manually_verified')),
          headCount((q) => q.eq('review_status', 'pending')),
          headCount((q) => q.eq('review_status', 'archived')),
          headCount((q) => q.eq('visibility', 'public')),
          headCount((q) => q.is('image_url', null)),
          headCount((q) => q.is('lgbti_connection_source', null)),
          headCount((q) => q.not('death_date', 'is', null)),
        ]);
      // Milestones are a first-class content type now — count only the
      // published (online) ones, not drafts awaiting review.
      const { count: milestone } = await untypedFrom('milestones')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published');
      return {
        total,
        freigegeben: approved + manuallyVerified,
        pending,
        archived,
        publicVis,
        noImage,
        noSource,
        deceased,
        milestone: milestone ?? 0,
      };
    },
  });
}

function Tile({
  label,
  value,
  tone,
  icon,
  to,
}: {
  label: string;
  value: number;
  tone?: AmpelTone;
  icon?: React.ReactNode;
  to?: string;
}) {
  // useRiskVisual is theme-aware and must be called unconditionally (see its doc).
  const visual = useRiskVisual(tone && tone !== 'gray' ? AMPEL_RISK[tone] : 'low');
  const dotColor =
    tone && tone !== 'gray' ? visual.fg : 'hsl(var(--muted-foreground))';
  const inner = (
    <div className="flex flex-col gap-1 rounded-container border border-border p-4">
      <div className="flex items-center gap-2">
        {tone && (
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: dotColor }}
            aria-hidden
          />
        )}
        {icon}
        <span className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <span className="text-display font-display tabular-nums">{nf(value)}</span>
    </div>
  );
  return to ? (
    <Link to={to} className="no-underline">
      {inner}
    </Link>
  ) : (
    inner
  );
}

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function daysUntil(occursOn: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = occursOn.split('-').map(Number);
  const occ = new Date(y, m - 1, d);
  occ.setHours(0, 0, 0, 0);
  return Math.round((occ.getTime() - today.getTime()) / 86_400_000);
}

export function PersonalityCheckPanel() {
  const { data: c } = useCounts();
  const [from, to] = useMemo(() => {
    const f = new Date();
    const t = new Date();
    t.setDate(t.getDate() + 30);
    return [f, t];
  }, []);
  const { items, loading } = usePersonalityAnniversaries(from, to, true);

  const upcoming = useMemo(
    () =>
      [...items]
        .map((it) => ({ ...it, days: daysUntil(it.occurs_on) }))
        .filter((it) => it.days >= 0)
        .sort((a, b) => a.days - b.days)
        .slice(0, 12),
    [items],
  );

  return (
    <section className="mb-6 flex flex-col gap-6">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Tile label="Gesamt" value={c?.total ?? 0} />
        <Tile label="Öffentlich" value={c?.publicVis ?? 0} />
        <Tile label="Freigegeben" value={c?.freigegeben ?? 0} tone="green" />
        <Tile label="Zu prüfen" value={c?.pending ?? 0} tone="yellow" />
        <Tile label="Archiviert" value={c?.archived ?? 0} tone="red" />
        <Tile
          label="Meilensteine"
          value={c?.milestone ?? 0}
          icon={<Award size={13} className="text-muted-foreground" />}
          to="/admin/content/milestones"
        />
        <Tile
          label="Ohne Bild"
          value={c?.noImage ?? 0}
          icon={<ImageOff size={13} className="text-muted-foreground" />}
        />
        <Tile
          label="Ohne Quelle"
          value={c?.noSource ?? 0}
          icon={<FileQuestion size={13} className="text-muted-foreground" />}
        />
      </div>

      {/* Anniversary stream */}
      <div>
        <h2 className="mb-2 text-title font-display">Anstehende Jahrestage</h2>
        {loading ? (
          <p className="text-13 text-muted-foreground">Lädt…</p>
        ) : upcoming.length === 0 ? (
          <p className="text-13 text-muted-foreground">Keine Jahrestage in den nächsten 30 Tagen.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {upcoming.map((it) => {
              const [, m, d] = it.occurs_on.split('-').map(Number);
              const born = it.anniversary === 'born';
              return (
                <li
                  key={`${it.id}-${it.anniversary}`}
                  className="flex items-center gap-4 rounded-element border border-border p-2"
                >
                  <div className="flex w-10 shrink-0 flex-col items-center">
                    <span className="text-title font-display leading-none tabular-nums">{d}</span>
                    <span className="text-2xs uppercase text-muted-foreground">{MONTHS[m - 1]}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {born ? (
                        <Cake size={14} className="shrink-0 text-muted-foreground" />
                      ) : (
                        <Flame size={14} className="shrink-0 text-muted-foreground" />
                      )}
                      <Link
                        to={`/admin/content/personalities/${it.id}/datasheet`}
                        className="truncate font-semibold text-foreground hover:underline"
                      >
                        {it.name}
                      </Link>
                    </div>
                    <p className="truncate text-13 text-muted-foreground">
                      {born ? 'Geburtstag' : 'Todestag'}
                      {it.years_ago ? ` · ${born ? 'wird' : 'vor'} ${it.years_ago}` : ''}
                      {it.profession ? ` · ${it.profession}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {it.days === 0 ? (
                      <span className="text-13 font-semibold">Heute</span>
                    ) : (
                      <>
                        <span className="text-title font-display tabular-nums">{it.days}</span>
                        <span className="ml-1 text-2xs text-muted-foreground">
                          {it.days === 1 ? 'Tag' : 'Tage'}
                        </span>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
