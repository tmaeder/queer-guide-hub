/**
 * FlowGraph — a branching line with signals, buffer stops and, where the
 * subject calls for it, a loop back.
 *
 * Serves both the decision-tree and the life-stage-flow archetypes: they are
 * the same graph, and the only difference is whether edges carry labels.
 *
 * Four things are load-bearing:
 *
 * - **Nothing inside the `<svg>` is focusable.** The SVG is `aria-hidden`
 *   decoration; every node is an HTML `<button>` plate laid over it. That is
 *   the repo's existing convention (NetworkDiagram, IntentMap, EraLine) and it
 *   means this codebase never has to invent roving-tabindex-inside-SVG. A
 *   component test asserts the SVG has no focusable descendants.
 * - **One `<ol>`, two presentations.** Below `md` the plates are a plain
 *   stacked list and the drawing is hidden; at `md` and up the same list items
 *   go absolute over the map via `--fx`/`--fy`. Same DOM, same focus order,
 *   no duplicated content — the `IntentMap` pattern.
 * - **An answer never changes a hue.** A map shows the end of a line with a
 *   buffer stop, not by turning the line red. Only outcome plates carry the
 *   locked risk wash, and only because they are genuine risk statements.
 * - **One accent.** Every line uses the track passed in. Branch identity comes
 *   from edge labels and buffer stops, not from colour.
 */

import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { TRACK_STROKE } from '@/components/transit/routeBulletMap';
import { useRiskVisual } from '@/hooks/useRiskVisual';
import type { InfographicViewProps, RiskTier, Track } from '../types';
import {
  ancestryOf,
  edgeKey,
  flowLayout,
  flowOrder,
  pct,
  type FlowEdge,
  type FlowNode,
} from './flowLayout';

export interface FlowGraphProps extends InfographicViewProps {
  nodes: readonly FlowNode[];
  edges: readonly FlowEdge[];
  viewBox: { w: number; h: number };
  track: Track;
  padX?: number;
  padY?: number;
  alignColumns?: boolean;
  /** Selecting a node lights the route that reaches it. */
  traversable?: boolean;
  /** Accessible name for the list of stops. */
  groupLabel: string;
  /** Told to the reader once, above the list, so the interaction is not a
   *  thing you have to discover by clicking. */
  hintLabel: string;
}

/** Risk wash for an outcome plate. Colour is never the only channel — the
 *  plate carries the tier's icon too, and every outcome is in the data table. */
function OutcomePlate({ tier, children }: { tier: RiskTier; children: React.ReactNode }) {
  const { bg, fg, border, Icon } = useRiskVisual(tier);
  return (
    <span
      style={{ backgroundColor: bg, color: fg, borderColor: border }}
      className="flex items-start gap-2 border-[3px] px-2 py-1.5 text-start"
    >
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </span>
  );
}

export function FlowGraph({
  nodes,
  edges,
  viewBox,
  track,
  padX,
  padY,
  alignColumns,
  traversable = true,
  groupLabel,
  hintLabel,
  rtl,
  reducedMotion,
  domId,
}: FlowGraphProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const hatchId = `${useId().replace(/:/g, '')}-hatch`;

  const layout = useMemo(
    () => flowLayout(nodes, edges, { viewBox, rtl, padX, padY, alignColumns }),
    [nodes, edges, viewBox, rtl, padX, padY, alignColumns],
  );

  const lit = useMemo(
    () => ancestryOf(layout.nodes, edges, traversable ? selected : null),
    [layout.nodes, edges, selected, traversable],
  );
  const hasSelection = lit.nodes.size > 0;

  const ordered = useMemo(() => flowOrder(layout.nodes, rtl), [layout.nodes, rtl]);

  return (
    <div className="relative w-full md:aspect-[var(--flow-aspect)]"
      style={{ '--flow-aspect': `${viewBox.w} / ${viewBox.h}` } as React.CSSProperties}
    >
      {/* The drawing. Hidden below `md`, where the stacked list carries the
          whole diagram on its own and a 300-unit-wide map would overlap. */}
      <div className="hidden md:block">
        <svg
          viewBox={`0 0 ${viewBox.w} ${viewBox.h}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            {/* Ink hatch for a speed-restriction section. Geometry only; the
                colour is `currentColor`, so it follows the token and can never
                hard-code a value. */}
            <pattern
              id={hatchId}
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="8" stroke="currentColor" strokeWidth="3" />
            </pattern>
          </defs>

          {layout.edges.map((e) => {
            const key = edgeKey(e);
            const dim = hasSelection && !lit.edges.has(key);
            return (
              <path
                key={key}
                d={e.d}
                fill="none"
                stroke={e.kind === 'loop' ? 'hsl(var(--foreground))' : TRACK_STROKE[track]}
                strokeWidth={e.kind === 'loop' ? 4 : 7}
                strokeLinecap="round"
                strokeDasharray={e.kind === 'loop' ? '10 8' : undefined}
                vectorEffect="non-scaling-stroke"
                opacity={dim ? 0.18 : 1}
                className={reducedMotion ? undefined : 'transition-opacity duration-normal'}
              />
            );
          })}

          {/* Buffer stops: a bar across the line at every terminal. This is how
              a map says "the line ends here" without spending a colour. */}
          {layout.nodes
            .filter((n) => n.kind === 'outcome')
            .map((n) => (
              <line
                key={`stop-${n.id}`}
                x1={n.center.x - 16}
                y1={n.center.y}
                x2={n.center.x + 16}
                y2={n.center.y}
                stroke="hsl(var(--foreground))"
                strokeWidth={7}
                vectorEffect="non-scaling-stroke"
                opacity={hasSelection && !lit.nodes.has(n.id) ? 0.18 : 1}
              />
            ))}

          {layout.nodes
            .filter((n) => n.kind === 'restriction')
            .map((n) => (
              <rect
                key={`hatch-${n.id}`}
                x={n.center.x - 54}
                y={n.center.y - 13}
                width={108}
                height={26}
                fill={`url(#${hatchId})`}
                className="text-foreground"
                opacity={hasSelection && !lit.nodes.has(n.id) ? 0.18 : 0.5}
              />
            ))}
        </svg>

        {/* Edge labels. HTML, so they stay translatable and legible — an SVG
            <text> in a `preserveAspectRatio="none"` viewBox is stretched. */}
        {layout.edges
          .filter((e) => e.labelKey)
          .map((e) => {
            const key = edgeKey(e);
            const dim = hasSelection && !lit.edges.has(key);
            return (
              <span
                key={`label-${key}`}
                aria-hidden
                style={{ left: pct(e.label.x, viewBox.w), top: pct(e.label.y, viewBox.h) }}
                className={cn(
                  'pointer-events-none absolute -translate-x-1/2 -translate-y-1/2',
                  'border-2 border-foreground bg-background px-1.5 py-0.5 text-2xs font-bold uppercase tracking-label',
                  dim && 'opacity-20',
                )}
              >
                {t(e.labelKey as string, e.labelFallback ?? '')}
              </span>
            );
          })}
      </div>

      <p className="mb-4 text-13 text-muted-foreground md:sr-only">{hintLabel}</p>

      {/* The interactive layer. `ordered` is lane-then-slot, so DOM order — and
          therefore focus order — follows the flow (WCAG 1.3.2 / 2.4.3). */}
      <ol
        aria-label={groupLabel}
        className="m-0 grid list-none gap-4 p-0 md:absolute md:inset-0 md:block md:gap-0"
      >
        {ordered.map((n) => {
          const dim = hasSelection && !lit.nodes.has(n.id);
          const isSelected = selected === n.id;
          const label = t(n.labelKey, n.labelFallback);
          const note = n.noteKey ? t(n.noteKey, n.noteFallback ?? '') : null;

          const body = (
            <>
              <span className="block font-bold">{label}</span>
              {note && <span className="mt-1 block font-normal opacity-90">{note}</span>}
            </>
          );

          return (
            <li
              key={n.id}
              style={
                {
                  '--fx': pct(n.center.x, viewBox.w),
                  '--fy': pct(n.center.y, viewBox.h),
                } as React.CSSProperties
              }
              className={cn(
                'md:absolute md:w-48 md:-translate-x-1/2 md:-translate-y-1/2',
                'md:left-[var(--fx)] md:top-[var(--fy)]',
                dim ? 'opacity-40' : 'opacity-100',
                !reducedMotion && 'transition-opacity duration-normal',
              )}
            >
              <button
                type="button"
                id={`${domId}-node-${n.id}`}
                aria-pressed={traversable ? isSelected : undefined}
                onClick={() => traversable && setSelected(isSelected ? null : n.id)}
                className={cn(
                  'block w-full text-start text-13 leading-snug',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
                  traversable ? 'cursor-pointer' : 'cursor-default',
                )}
              >
                {n.kind === 'outcome' && n.tier ? (
                  <OutcomePlate tier={n.tier}>{body}</OutcomePlate>
                ) : (
                  <span
                    className={cn(
                      'block border-[3px] border-foreground px-2 py-1.5',
                      n.kind === 'start' ? 'bg-foreground text-background' : 'bg-background',
                      isSelected && 'shadow-hard-sm',
                    )}
                  >
                    {body}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
