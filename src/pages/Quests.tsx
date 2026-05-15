import { Link } from 'react-router';
import { Flag } from 'lucide-react';
import { PageHero, BentoSection, spansForPreset } from '@/components/discovery';
import { Badge } from '@/components/ui/badge';

const QUEST_SPAN_CLASS: Record<string, string> = {
  sm: 'col-span-12 sm:col-span-6 md:col-span-4',
  md: 'col-span-12 sm:col-span-6 md:col-span-4',
  lg: 'col-span-12 sm:col-span-6 md:col-span-6',
  wide: 'col-span-12 md:col-span-8',
  tall: 'col-span-12 sm:col-span-6 md:col-span-4 row-span-2',
};
import { EmptyState } from '@/components/ui/EmptyState';
import { useMeta } from '@/hooks/useMeta';
import { useQuests, type Quest } from '@/hooks/useQuests';

function statusBucket(q: Quest): 'active' | 'upcoming' | 'past' {
  const now = Date.now();
  const start = new Date(q.starts_at).getTime();
  const end = new Date(q.ends_at).getTime();
  if (q.status === 'completed' || q.status === 'archived' || end < now) return 'past';
  if (q.status === 'active' || (start <= now && end >= now)) return 'active';
  return 'upcoming';
}

function fmtRange(starts: string, ends: string) {
  const s = new Date(starts);
  const e = new Date(ends);
  const fmt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${s.toLocaleDateString(undefined, fmt)} – ${e.toLocaleDateString(undefined, fmt)}, ${e.getFullYear()}`;
}

export default function Quests() {
  useMeta({
    title: 'Editorial Quests · queer.guide',
    description: 'Time-bounded community challenges. Help us preserve queer history, document spaces, and close gaps in coverage.',
  });

  const { data: quests, isLoading } = useQuests();
  const list = quests ?? [];

  const groups = {
    active: list.filter((q) => statusBucket(q) === 'active'),
    upcoming: list.filter((q) => statusBucket(q) === 'upcoming'),
    past: list.filter((q) => statusBucket(q) === 'past'),
  };

  return (
    <div className="min-h-screen">
      <PageHero
        eyebrow="Editorial Quests"
        title="Participate in the project."
        lede="One month, one theme. Add what's missing, mark what you've seen, and earn a named credit in the recap article."
        size="md"
      />
      <div className="container mx-auto px-4 py-8 md:py-12 relative">
        {isLoading ? (
          <p className="text-center text-muted-foreground">Loading quests…</p>
        ) : list.length === 0 ? (
          <EmptyState icon={Flag} title="No quests yet." description="The first editorial quest will go live soon." />
        ) : (
          <div className="space-y-12">
            <Section title="Active" quests={groups.active} highlight />
            <Section title="Upcoming" quests={groups.upcoming} />
            <Section title="Past quests" quests={groups.past} muted />
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, quests, highlight, muted }: { title: string; quests: Quest[]; highlight?: boolean; muted?: boolean }) {
  if (quests.length === 0) return null;
  return (
    <section>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h2>
      <BentoSection preset={highlight ? 'featured' : 'mosaic'}>
        {quests.map((q, i) => {
          const span = highlight ? spansForPreset('featured', i, quests.length) : spansForPreset('mosaic', i, quests.length);
          return (
            <div key={q.id} className={QUEST_SPAN_CLASS[span]}>
              <QuestCard quest={q} highlight={highlight} muted={muted} />
            </div>
          );
        })}
      </BentoSection>
    </section>
  );
}

function QuestCard({ quest, highlight, muted }: { quest: Quest; highlight?: boolean; muted?: boolean }) {
  const bucket = statusBucket(quest);
  return (
    <Link
      to={`/quests/${quest.slug}`}
      className={`group flex h-full flex-col rounded-container border border-border bg-card p-6 transition-colors duration-300 hover:border-foreground/40 ${
        muted ? 'opacity-80' : ''
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <Badge variant={highlight ? 'default' : 'outline'}>
          {bucket === 'active' ? 'Live now' : bucket === 'upcoming' ? 'Soon' : 'Recap'}
        </Badge>
        <span className="text-xs text-muted-foreground">{fmtRange(quest.starts_at, quest.ends_at)}</span>
      </div>
      <h3 className="text-balance text-xl font-semibold tracking-tight group-hover:underline">
        {quest.title}
      </h3>
      {quest.theme && (
        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">{quest.theme}</p>
      )}
      {quest.brief_md && (
        <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
          {quest.brief_md.replace(/^#.*$/gm, '').trim().slice(0, 180)}
        </p>
      )}
    </Link>
  );
}
