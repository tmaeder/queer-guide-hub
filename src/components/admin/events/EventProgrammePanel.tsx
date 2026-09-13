import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Link2Off, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { untypedFrom, untypedSupabase } from '@/integrations/supabase/untyped';
import { AdminEmpty } from '@/components/admin/primitives/AdminEmpty';
import { AdminCardSkeleton, AdminInlineSpinner } from '@/components/admin/primitives/AdminLoading';

/**
 * Attach a festival's day-parts and satellite events to their umbrella.
 *
 * WHY THIS EXISTS. `events.parent_event_id`, the depth guard, `event_programme()`,
 * the reader-facing programme and the merge-core umbrella guard have all shipped and
 * work — and the column is set on 8 of 48,000 events. `event_programme_candidates()`
 * was written as "the suggestion list for a programme-editing admin panel" and its
 * only reference in the repo was the generated types file. There has never been a way
 * to make this link by hand: the field is not in `eventFields`, so the generic CMS
 * editor cannot reach it either.
 *
 * PULL, NOT PUSH. The nightly linker is high-precision by design and has exhausted
 * what it can see (a dry run links 0 today); everything it cannot resolve is a
 * judgement call. That work belongs in a panel an editor opens for the festival they
 * are already working on, not in a queue — a queue of "we could not work this out"
 * is the shape this repo has disabled twice.
 *
 * The DB refuses two-level chains (`events_programme_depth_guard`) and refuses to let
 * an umbrella and its own child be merged. Those errors are surfaced verbatim rather
 * than pre-empted here: the trigger is the authority, and a second copy of its rules
 * in the UI is a copy that can drift.
 */

interface ProgrammeChild {
  id: string;
  slug: string | null;
  title: string;
  start_date: string;
  venue_name: string | null;
}

interface Candidate {
  id: string;
  slug: string | null;
  title: string;
  start_date: string;
  venue_name: string | null;
}

interface ProgrammeResponse {
  umbrella: { id: string; title: string; start_date: string; end_date: string | null } | null;
  children: ProgrammeChild[];
}

function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  // Midnight is what an all-day import looks like after normalisation, not a real
  // start time — printing "00:00" would invent a precision the row has not got.
  const time =
    d.getHours() === 0 && d.getMinutes() === 0
      ? ''
      : ` · ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  return `${day}${time}`;
}

export function EventProgrammePanel({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const programme = useQuery({
    queryKey: ['admin-event-programme', eventId],
    queryFn: async (): Promise<ProgrammeResponse> => {
      const { data, error } = await untypedSupabase.rpc('event_programme', {
        p_event_id: eventId,
      });
      if (error) throw error;
      return (data ?? { umbrella: null, children: [] }) as ProgrammeResponse;
    },
  });

  // The RPC resolves either side to the same root, so opening a CHILD shows the
  // festival's whole programme. `isChild` is what tells the editor which one they
  // have open — without it the panel looks identical from both ends.
  const root = programme.data?.umbrella ?? null;
  const isChild = Boolean(root && root.id !== eventId);

  const candidates = useQuery({
    queryKey: ['admin-event-programme-candidates', root?.id],
    // Suggestions are only meaningful for the umbrella; a child cannot adopt.
    enabled: Boolean(root?.id) && !isChild,
    queryFn: async (): Promise<Candidate[]> => {
      const { data, error } = await untypedSupabase.rpc('event_programme_candidates', {
        p_event_id: root!.id,
        p_limit: 40,
      });
      if (error) throw error;
      return (data ?? []) as Candidate[];
    },
  });

  const setParent = useMutation({
    mutationFn: async ({ childId, parentId }: { childId: string; parentId: string | null }) => {
      const { error } = await untypedFrom('events')
        .update({ parent_event_id: parentId })
        .eq('id', childId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-event-programme'] });
      void qc.invalidateQueries({ queryKey: ['admin-event-programme-candidates'] });
    },
    onError: (e: unknown) => {
      // The depth guard and the FK speak for themselves; showing the raw message is
      // more useful than a paraphrase that can fall out of step with the trigger.
      toast({
        title: 'The database refused that link',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    },
  });

  if (programme.isLoading) return <AdminCardSkeleton />;
  if (programme.error) {
    return <p className="text-destructive text-13">Could not load the programme.</p>;
  }

  return (
    <div className="space-y-8">
      {isChild && root && (
        <div className="border-border-hairline rounded-element border p-4">
          <p className="text-13">
            This event is a programme child of <strong>{root.title}</strong>. It is hidden from the
            browse feed and shown on that festival&apos;s page instead; its own detail page still
            resolves.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            disabled={setParent.isPending}
            onClick={() => setParent.mutate({ childId: eventId, parentId: null })}
          >
            <Link2Off className="mr-2 h-4 w-4" />
            Detach from {root.title}
          </Button>
        </div>
      )}

      <section>
        <h3 className="text-title mb-4 font-bold">
          Programme ({programme.data?.children.length ?? 0})
        </h3>
        {programme.data?.children.length ? (
          <ul className="space-y-2">
            {programme.data.children.map((c) => (
              <li
                key={c.id}
                className="border-border-hairline flex items-center justify-between gap-4 rounded-element border p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold">{c.title}</p>
                  <p className="text-muted-foreground text-13">
                    {whenLabel(c.start_date)}
                    {c.venue_name ? ` · ${c.venue_name}` : ''}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={setParent.isPending}
                  onClick={() => setParent.mutate({ childId: c.id, parentId: null })}
                >
                  <Link2Off className="mr-2 h-4 w-4" />
                  Detach
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <AdminEmpty noun="programme children" />
        )}
      </section>

      {!isChild && root && (
        <section>
          <h3 className="text-title mb-1 font-bold">Suggested</h3>
          <p className="text-muted-foreground text-13 mb-4">
            Unattached events in the same city, inside this event&apos;s dates. Suggestion only —
            nothing here is linked until you say so.
          </p>

          <div className="relative mb-4">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter suggestions"
              className="pl-8"
            />
          </div>

          {candidates.isLoading && <AdminInlineSpinner />}

          {candidates.data?.length ? (
            <ul className="space-y-2">
              {candidates.data
                .filter((c) => c.title.toLowerCase().includes(search.trim().toLowerCase()))
                .map((c) => (
                  <li
                    key={c.id}
                    className="border-border-hairline flex items-center justify-between gap-4 rounded-element border p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-bold">{c.title}</p>
                      <p className="text-muted-foreground text-13">
                        {whenLabel(c.start_date)}
                        {c.venue_name ? ` · ${c.venue_name}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={setParent.isPending}
                      onClick={() => setParent.mutate({ childId: c.id, parentId: root.id })}
                    >
                      <Link2 className="mr-2 h-4 w-4" />
                      Attach
                    </Button>
                  </li>
                ))}
            </ul>
          ) : (
            !candidates.isLoading && (
              <AdminEmpty
                noun="suggestions"
                // `filtered` is the difference between "this festival has no
                // candidates" and "your filter matched none of them" — the search box
                // above makes the second state reachable, and AdminEmpty exists
                // precisely because ~41 ad-hoc "No X found" strings never told them
                // apart.
                filtered={search.trim().length > 0}
                onReset={() => setSearch('')}
                description="Suggestions are same-city events inside this event's dates that are not already attached. An event spanning a single day usually has none."
              />
            )
          )}
        </section>
      )}

      {root && (
        <p className="text-muted-foreground text-2xs">
          A programme is exactly one level deep — a child cannot itself have children, and the
          database refuses to merge an umbrella with its own child.
          <Badge variant="outline" className="ml-2">
            {root.title}
          </Badge>
        </p>
      )}
    </div>
  );
}
