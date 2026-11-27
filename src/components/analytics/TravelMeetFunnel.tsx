import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { Button } from '@/components/ui/button';
import { AdminTextSkeleton } from '@/components/admin/primitives/AdminLoading';

interface TravelFunnelSummary {
  browsed: number;
  requested: number;
  accepted: number;
  started: number;
  browse_to_request_pct: number | null;
  request_to_accept_pct: number | null;
  accept_to_conversation_pct: number | null;
  browse_to_conversation_pct: number | null;
}

function percent(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

export function TravelMeetFunnel({ days }: { days: string }) {
  const report = useQuery({
    queryKey: ['travel-meet-funnel', days],
    queryFn: async () => {
      const { data, error } = await untypedRpc<TravelFunnelSummary>('travel_meet_funnel_summary', {
        p_days: Number(days),
      });
      if (error || !data) throw new Error('Travel connection analytics could not be loaded.');
      return data;
    },
  });
  const data = report.data;
  const stages = data
    ? [
        { label: 'Browsing invitations', count: data.browsed, rate: null },
        { label: 'Requested to join', count: data.requested, rate: data.browse_to_request_pct },
        { label: 'Request accepted', count: data.accepted, rate: data.request_to_accept_pct },
        {
          label: 'Conversation started',
          count: data.started,
          rate: data.accept_to_conversation_pct,
        },
      ]
    : [];
  return (
    <section aria-labelledby="travel-funnel-title" className="flex flex-col gap-4">
      <div>
        <h2 id="travel-funnel-title" className="text-15 font-semibold">
          Travel connections
        </h2>
        <p className="text-13 text-muted-foreground">
          Unique consenting signed-in travellers, from browsing /meet/travel to a real conversation.
        </p>
      </div>
      {report.isLoading ? (
        <AdminTextSkeleton lines={4} />
      ) : report.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-13 text-destructive">
            Travel connection analytics could not be loaded.
          </p>
          <Button variant="outline" size="sm" onClick={() => void report.refetch()}>
            Retry travel analytics
          </Button>
        </div>
      ) : data ? (
        <>
          {data.browsed === 0 && (
            <p className="text-13 text-muted-foreground">
              No consented travel browsing recorded in this period.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-13">
              <caption className="sr-only">
                Travel connection funnel for the last {days} days
              </caption>
              <thead>
                <tr className="border-b">
                  <th scope="col" className="py-4 text-left font-medium">
                    Stage
                  </th>
                  <th scope="col" className="py-4 text-right font-medium">
                    Travellers
                  </th>
                  <th scope="col" className="py-4 pl-4 text-right font-medium">
                    From previous stage
                  </th>
                </tr>
              </thead>
              <tbody>
                {stages.map((stage) => (
                  <tr key={stage.label} className="border-b">
                    <th scope="row" className="py-4 text-left font-normal">
                      {stage.label}
                    </th>
                    <td className="py-4 text-right tabular-nums">{stage.count.toLocaleString()}</td>
                    <td className="py-4 pl-4 text-right tabular-nums">{percent(stage.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-13">
            Browse → conversation:{' '}
            <strong className="tabular-nums">{percent(data.browse_to_conversation_pct)}</strong>
          </p>
        </>
      ) : null}
      <p className="text-2xs text-muted-foreground">
        Each traveller counts once per stage in the selected period. Later stages follow the same
        request, including acceptance by a host and the first message from either participant after
        acceptance. Earlier chat history and deleted or system messages do not count. Browsing
        includes empty results after choosing a destination and dates. Anonymous visitors, people
        without analytics consent, automated clients and test accounts are excluded. Collection
        starts with this release; no historical browsing is backfilled. A dash means there is no
        denominator.
      </p>
    </section>
  );
}
