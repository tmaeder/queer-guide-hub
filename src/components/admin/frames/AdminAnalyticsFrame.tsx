import * as React from 'react';
import { cn } from '@/lib/utils';
import { AdminArchetypeHeader } from './AdminArchetypeHeader';

interface AdminAnalyticsFrameProps {
  title: React.ReactNode;
  routeLine?: string | null;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  /** Optional 4-up stat row above the board. */
  stats?: React.ReactNode;
  /** The chart. Spans two of three columns. */
  chart: React.ReactNode;
  /**
   * The ranked list. Singular, and it must IMPLY AN ACTION — see below.
   */
  rankedList: React.ReactNode;
  className?: string;
}

/**
 * Archetype E — Analytics board.
 *
 * *"Line chart drawn as track, plus one ranked list that implies an action."*
 * Mock layout: three columns, chart spanning two.
 *
 * **"One ranked list that implies an action" is the whole archetype.** A board
 * of six charts is a dashboard nobody reads; the shape here is one trend plus
 * one "and therefore do this" — the mock's own list is captioned *"Each one is
 * a content brief. Send to pipelines →"*. The frame takes a single
 * `rankedList` rather than a `children` slot so that constraint is structural
 * instead of advisory.
 *
 * The chart is drawn as a TRACK (`trackChartPalette` cycles the four track
 * colours, guarded by `chartPalette.test.ts`). That is the one admin surface
 * where the track colours legitimately appear: a chart series is wayfinding
 * between lines, not a status.
 */
export function AdminAnalyticsFrame({
  title,
  routeLine,
  filters,
  actions,
  stats,
  chart,
  rankedList,
  className,
}: AdminAnalyticsFrameProps) {
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <AdminArchetypeHeader
        title={title}
        routeLine={routeLine}
        filters={filters}
        actions={actions}
      />
      {stats && <div className="px-6 pb-4">{stats}</div>}
      <div className="grid min-w-0 gap-6 px-6 pb-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">{chart}</div>
        <div className="min-w-0">{rankedList}</div>
      </div>
    </div>
  );
}
