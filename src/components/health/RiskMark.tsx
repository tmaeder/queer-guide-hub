import { cn } from '@/lib/utils';
import { transmissionRiskVisual, RISK_MARK_BORDER, BloodIcon } from '@/lib/stiRisk';

/**
 * The ONE renderer of a transmission-risk fill.
 *
 * It exists because the contract `stiRisk.ts` states — "never render a fill
 * without the ink border" — was documented in three places, asserted in none,
 * and false in both consumers. Measured on prod 2026-09-04: every filled cell
 * of the STI guide's transmission matrix computed to `border-width: 0px`, and
 * the per-tag `StiProfile` band drew its chips the same way, while both files'
 * own comments claimed a border was drawn. `stiRisk.test.ts` even proves the
 * need for it — its third case asserts `tint-vs-paper < 3`, i.e. that the tint
 * ALONE fails WCAG 1.4.11 — and then nothing checked that anything drew one.
 *
 * A comment cannot hold an invariant and a constants module cannot either: the
 * guarantee is about the DOM, so it has to live in the component that produces
 * the DOM, with a test that reads computed styles. Hence one component, used by
 * the legend, the grid, the per-infection cards and the tag band, rather than
 * four hand-rolled `style={{ backgroundColor }}` spans that agree by luck.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL (WCAG 1.4.1): every mark carries its level's
 * distinct icon, and `blood` adds a second glyph. `label` puts the level in
 * text; where the layout has no room for it (a grid cell), the caller supplies
 * the accessible name instead — it is never simply absent.
 */

interface Base {
  /** Raw risk key. An unknown value degrades to `high` — see stiRisk.ts. */
  risk: string;
  /** The "risk with blood" modifier: a second glyph, never a colour. */
  blood?: boolean;
  size?: 'sm' | 'md';
  /**
   * Stretch to the container's width. For a matrix cell, where the mark IS the
   * cell and a ragged column of intrinsic-width marks would read as noise.
   *
   * Off by default, because width is the CALLER's decision and baking `w-full`
   * into the component made the mark greedy everywhere else. In the legend it
   * ate its own row: the mark stretched, the sibling text got squeezed, and
   * "WITH BLOOD" wrapped to two lines against it. A mark that always fills has
   * no intrinsic size to lay out next to anything.
   */
  fill?: boolean;
  className?: string;
}

/**
 * The naming contract, enforced by the type instead of a comment.
 *
 * It was first written `srLabel?: string` with a comment saying "required when
 * `label` is false" — which is the same shape of promise this whole component
 * exists to replace, and it was already being broken: `StiProfile` omitted it
 * on every non-blood row. Three arms, so a caller has to say which one it is:
 *   - `label` — the level is visible text inside the mark
 *   - `srLabel` — the mark is a glyph and this is its accessible name
 *   - `describedByRow` — the level is visible text ELSEWHERE in the same row,
 *     so a name on the mark would make a screen reader announce it twice
 *     ("High risk High risk"). Naming the case is the point: it is now a
 *     decision a caller states, not a default it falls into.
 */
type Props = Base &
  (
    | { label: true; srLabel?: string; describedByRow?: never }
    | { label?: false; srLabel: string; describedByRow?: never }
    | { label?: false; srLabel?: never; describedByRow: true }
  );

export function RiskMark({ risk, blood, label, srLabel, size = 'md', fill, className }: Props) {
  const v = transmissionRiskVisual(risk);
  const Icon = v.Icon;
  const glyph = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <span
      className={cn(
        // `rounded-badge` (9px), the documented rank for swatches and micro
        // marks — NOT `rounded-element` (12px), which turned the matrix into a
        // field of lozenges whose corners pinched into four-point stars where
        // four cells met. The first draft answered that by going square, but
        // the system's rule is "Nothing square" with no chart exception, and
        // 9px on a 28px cell does not pinch. Right diagnosis, wrong rank.
        // `whitespace-nowrap` so a mark carrying its level as text stays one
        // line whatever the container does to it.
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-badge border-2',
        label ? 'px-2 py-1' : size === 'sm' ? 'h-6 w-6' : 'h-7 min-w-7 px-1.5',
        fill && 'w-full',
        className,
      )}
      style={{
        backgroundColor: `hsl(${v.tint})`,
        color: `hsl(${v.ink})`,
        borderColor: `hsl(${RISK_MARK_BORDER})`,
      }}
    >
      <Icon className={cn(glyph, 'shrink-0')} aria-hidden="true" />
      {blood && <BloodIcon className={cn(glyph, 'shrink-0')} aria-hidden="true" />}
      {label && <span className="text-2xs font-bold uppercase tracking-label">{v.label}</span>}
      {srLabel && <span className="sr-only">{srLabel}</span>}
    </span>
  );
}
