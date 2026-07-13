import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Award, Table2, Search } from 'lucide-react';
import { untypedFrom } from '@/integrations/supabase/untyped';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

/**
 * Admin milestone stream — every personality that carries a `milestone`
 * highlight, as a scannable card list. Ported from the PHP curation tool's
 * "Meilensteine" view. Read-only overview; edit links jump to the CMS editor.
 * Full personality CRUD stays at /admin/content/personalities.
 */

interface MilestoneRow {
  id: string;
  name: string;
  profession: string | null;
  milestone: string | null;
  birth_date: string | null;
  death_date: string | null;
  visibility: string | null;
}

const yearOf = (iso?: string | null): string => (iso ? iso.slice(0, 4) : '');

export default function PersonalityMilestones() {
  const [q, setQ] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-personality-milestones'],
    queryFn: async () => {
      const { data, error } = await untypedFrom('personalities')
        .select('id, name, profession, milestone, birth_date, death_date, visibility')
        .not('milestone', 'is', null)
        .neq('milestone', '')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as MilestoneRow[];
    },
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        (r.milestone ?? '').toLowerCase().includes(needle) ||
        (r.profession ?? '').toLowerCase().includes(needle),
    );
  }, [data, q]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-headline flex items-center gap-2">
            <Award size={22} /> Milestones
          </h1>
          <p className="text-13 text-muted-foreground">
            Personalities carrying an editorial milestone highlight.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/content/personalities">
            <Table2 size={14} className="mr-1" /> Edit personalities
          </Link>
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by name, milestone or profession…"
          className="pl-8"
        />
      </div>

      {isLoading && <p className="text-13 text-muted-foreground">Loading…</p>}
      {error && <p className="text-13 text-destructive">Could not load milestones.</p>}
      {!isLoading && !error && (
        <>
          <p className="text-13 text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'milestone' : 'milestones'}
            {q && data ? ` of ${data.length}` : ''}
          </p>
          {filtered.length === 0 ? (
            <p className="text-13 text-muted-foreground">No milestones yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {filtered.map((r) => {
                const span = [yearOf(r.birth_date), yearOf(r.death_date)].filter(Boolean).join('–');
                return (
                  <li
                    key={r.id}
                    className="flex items-start gap-4 rounded-element border border-border p-4"
                  >
                    <Award size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/admin/content/personalities/${r.id}/datasheet`}
                          className="font-semibold text-foreground hover:underline"
                        >
                          {r.name}
                        </Link>
                        {span && (
                          <span className="font-mono text-2xs text-muted-foreground">{span}</span>
                        )}
                        {r.profession && (
                          <span className="text-13 text-muted-foreground">{r.profession}</span>
                        )}
                        {r.visibility && r.visibility !== 'public' && (
                          <Badge variant="outline" className="text-2xs">
                            {r.visibility}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-13 leading-relaxed">{r.milestone}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
