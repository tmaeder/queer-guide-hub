import { useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { amountMicros, formatRevenue } from '@/lib/redirects/conversions';
import { DashboardError, readSharedRedirectReport } from '@/lib/redirects/publicReport';
type DateRange = {
  start: string | null;
  end: string | null;
  earliest: string | null;
  latest: string | null;
};
const inputDate = (value: string | null) =>
  value ? new Date(value).toISOString().slice(0, -1) : '';
function PublicReportDates({
  range,
  snapshot,
  pending,
  onApply,
}: {
  range: DateRange;
  snapshot: string;
  pending: boolean;
  onApply: (dates: { start?: string; end?: string }) => void;
}) {
  const [start, setStart] = useState(() => inputDate(range.start));
  const [end, setEnd] = useState(() => inputDate(range.end));
  const [validation, setValidation] = useState('');
  const apply = (days?: number) => {
    setValidation('');
    if (!days) {
      setStart(inputDate(range.earliest));
      setEnd(inputDate(range.latest));
      onApply({});
      return;
    }
    const finish = Math.min(
      Date.parse(snapshot),
      range.latest ? Date.parse(range.latest) : Infinity,
    );
    const begin = Math.max(
      finish - days * 86400000,
      range.earliest ? Date.parse(range.earliest) : -Infinity,
    );
    if (begin >= finish) {
      setValidation(
        'No time in this preset falls within the published period. Choose custom dates.',
      );
      return;
    }
    const dates = { start: new Date(begin).toISOString(), end: new Date(finish).toISOString() };
    setStart(inputDate(dates.start));
    setEnd(inputDate(dates.end));
    onApply(dates);
  };
  return (
    <section aria-label="Reporting dates" className="space-y-4 border-y py-4">
      <h2 className="text-title font-sans font-bold">Reporting dates</h2>
      <p className="text-sm text-muted-foreground">
        Dates use UTC. Start is inclusive; end is exclusive. Selection stays within the published
        period.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={pending} onClick={() => apply(7)}>
          Last 7 days
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => apply(30)}>
          Last 30 days
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => apply()}>
          Published dates
        </Button>
      </div>
      <form
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          setValidation('');
          const dates = {
            ...(start ? { start: new Date(start + 'Z').toISOString() } : {}),
            ...(end ? { end: new Date(end + 'Z').toISOString() } : {}),
          };
          if (dates.start && dates.end && dates.start >= dates.end) {
            setValidation('Start must be before end.');
            return;
          }
          onApply(dates);
        }}
      >
        <div className="min-w-0 space-y-2">
          <Label htmlFor="report-start">Start (UTC)</Label>
          <Input
            className="min-w-0 max-w-full text-base"
            id="report-start"
            type="datetime-local"
            step="0.001"
            min={inputDate(range.earliest)}
            max={inputDate(range.latest)}
            value={start}
            disabled={pending}
            onChange={(event) => setStart(event.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="report-end">End (UTC, exclusive)</Label>
          <Input
            className="min-w-0 max-w-full text-base"
            id="report-end"
            type="datetime-local"
            step="0.001"
            min={inputDate(range.earliest)}
            max={inputDate(range.latest)}
            value={end}
            disabled={pending}
            onChange={(event) => setEnd(event.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Updating dates…' : 'Apply dates'}
          </Button>
        </div>
      </form>
      {validation && (
        <p role="alert" className="text-sm">
          {validation}
        </p>
      )}
      <p className="text-sm">
        Showing{' '}
        {range.start
          ? new Date(range.start).toLocaleString(undefined, { timeZone: 'UTC' })
          : 'all published history'}{' '}
        to{' '}
        {range.end
          ? new Date(range.end).toLocaleString(undefined, { timeZone: 'UTC' })
          : 'the latest data'}{' '}
        (UTC).
      </p>
    </section>
  );
}
export function SharedReportView({ id }: { id: string }) {
  const [password, setPassword] = useState('');
  const request = useRef<{ password: string; dates: { start?: string; end?: string } }>({
    password: '',
    dates: {},
  });
  const [viewKey] = useState(() => crypto.randomUUID());
  const query = useQuery({
    queryKey: ['redirect-public-report', id, viewKey],
    queryFn: ({ signal }) =>
      readSharedRedirectReport(id, request.current.password, signal, request.current.dates),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const error = query.error as DashboardError | null;
  const data = query.isError ? undefined : query.data;
  const metrics: ('clicks' | 'leads' | 'sales')[] = data?.includeConversions
    ? ['clicks', 'leads', 'sales']
    : ['clicks'];
  const maximum = Math.max(
    1,
    ...(data?.report.series.flatMap((p) => metrics.map((metric) => p[metric] ?? 0)) ?? []),
  );
  return (
    <PageContainer>
      <title>Shared link report · Queer Guide</title>
      <meta name="robots" content={data?.allowIndexing ? 'index,follow' : 'noindex,nofollow'} />
      <meta name="referrer" content="no-referrer" />
      <div className="space-y-6">
        <header>
          <h1 className="text-headline font-normal">{data?.title ?? 'Shared link report'}</h1>
          <p className="text-sm text-muted-foreground">
            Published aggregate analytics. Individual events and customer identities are private.
          </p>
        </header>
        {query.isPending && <p role="status">Loading dashboard…</p>}
        {query.isError && (
          <div className="space-y-4">
            <p role="alert">{error?.message}</p>
            {error?.passwordRequired ? (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  request.current = { ...request.current, password };
                  void query.refetch();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="shared-report-password">Dashboard password</Label>
                  <Input
                    id="shared-report-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={256}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={query.isFetching}>
                  View dashboard
                </Button>
              </form>
            ) : (
              <Button
                variant="outline"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                Retry dashboard
              </Button>
            )}
          </div>
        )}
        {query.data?.dateRange && (!query.isError || error?.status === 400) && (
          <PublicReportDates
            range={query.data.dateRange}
            snapshot={query.data.report.snapshot}
            pending={query.isFetching}
            onApply={(dates) => {
              request.current = { ...request.current, dates };
              void query.refetch();
            }}
          />
        )}
        {data && !query.isError && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm">
                {data.linkCount} accessible link{data.linkCount === 1 ? '' : 's'} · Updated{' '}
                {new Date(data.report.snapshot).toLocaleString()} ·{' '}
                {data.scopeMode === 'folder' ? 'Matching folder links' : 'Published link set'}
              </p>
              <Button
                variant="outline"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                {query.isFetching ? 'Refreshing…' : 'Refresh dashboard'}
              </Button>
            </div>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Object.entries(data.report.totals).map(([key, value]) => (
                <div key={key} className="border-t py-4">
                  <dt className="text-sm capitalize">{key}</dt>
                  <dd className="text-headline font-normal">{value.toLocaleString()}</dd>
                </div>
              ))}
            </dl>
            {data.includeConversions && data.report.revenue.length > 0 && (
              <section aria-label="Revenue" className="space-y-2">
                <h2 className="text-title font-sans font-bold">Revenue by currency</h2>
                {data.report.revenue.map((row) => (
                  <p key={row.currency}>{formatRevenue(amountMicros(row.amount), row.currency)}</p>
                ))}
              </section>
            )}
            <section
              aria-label={data.includeConversions ? 'Activity over time' : 'Clicks over time'}
              className="space-y-2"
            >
              <h2 className="text-title font-sans font-bold">
                {data.includeConversions ? 'Activity' : 'Clicks'} over time · {data.report.interval}{' '}
                · UTC
              </h2>
              <svg
                className="h-40 w-full"
                viewBox="0 0 600 160"
                role="img"
                aria-label={
                  data.includeConversions
                    ? 'Aggregate activity over time'
                    : 'Aggregate clicks over time'
                }
              >
                {metrics.map((metric) => (
                  <g key={metric}>
                    <polyline
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeDasharray={
                        metric === 'leads' ? '8 4' : metric === 'sales' ? '2 4' : undefined
                      }
                      points={data.report.series
                        .map(
                          (point, index) =>
                            `${data.report.series.length < 2 ? 300 : 10 + (index / (data.report.series.length - 1)) * 580},${150 - ((point[metric] ?? 0) / maximum) * 140}`,
                        )
                        .join(' ')}
                    />
                    {data.report.series.map((point, index) => (
                      <circle
                        key={point.at}
                        cx={
                          data.report.series.length < 2
                            ? 300
                            : 10 + (index / (data.report.series.length - 1)) * 580
                        }
                        cy={150 - ((point[metric] ?? 0) / maximum) * 140}
                        r="3"
                        fill="currentColor"
                      >
                        <title>
                          {new Date(point.at).toISOString()} · {point[metric] ?? 0} {metric}
                        </title>
                      </circle>
                    ))}
                  </g>
                ))}
              </svg>
              {data.includeConversions && (
                <p className="text-xs">Clicks (solid) · Leads (long dash) · Sales (dotted)</p>
              )}
              <div className="flex justify-between gap-2 text-xs">
                <span>{data.report.series[0]?.at.slice(0, 10)}</span>
                <span>{data.report.series.at(-1)?.at.slice(0, 10)}</span>
              </div>
            </section>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Object.entries(data.report.breakdowns).map(([dimension, rows]) => (
                <section key={dimension} className="space-y-2 border-t pt-4">
                  <h2 className="text-title font-sans font-bold capitalize">
                    {dimension === 'os'
                      ? 'Operating systems'
                      : dimension === 'qr'
                        ? 'Link / QR'
                        : dimension}{' '}
                    · events
                  </h2>
                  <ul className="space-y-2">
                    {rows.slice(0, 10).map((row) => (
                      <li key={row.label} className="flex justify-between gap-4">
                        <span>{row.label}</span>
                        <span>{row.count.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                  {!rows.length && (
                    <p className="text-sm text-muted-foreground">No matching activity.</p>
                  )}
                </section>
              ))}
            </div>
            {data.expiresAt && (
              <p className="text-xs text-muted-foreground">
                Dashboard access expires {new Date(data.expiresAt).toLocaleString()}.
              </p>
            )}
          </>
        )}
      </div>
    </PageContainer>
  );
}
export default function SharedRedirectReport() {
  const { reportId = '' } = useParams();
  return <SharedReportView key={reportId} id={reportId} />;
}
