/**
 * Monochrome recharts palette — for admin/cms data-viz that used to lean
 * on chromatic series colors. Series are distinguished by foreground
 * opacity ramp and (for lines) by stroke-dash patterns.
 *
 * Pair small-multiples or a legend with text labels when n > 4 — opacity
 * alone compresses below that.
 *
 * Added 2026-05-19 (refactor/monochrome-2026 Phase 3a).
 */

export function monoChartPalette(n: number): string[] {
  if (n <= 0) return [];
  if (n === 1) return ['hsl(var(--foreground))'];
  const span = 0.85;
  return Array.from({ length: n }, (_, i) => {
    const alpha = 1 - (i * span) / (n - 1);
    return `hsl(var(--foreground) / ${alpha.toFixed(3)})`;
  });
}

/**
 * Stroke-dash patterns for line series, in order. Pair with palette opacity
 * so series stay distinguishable even when printed grayscale.
 */
export const monoChartStrokePatterns: readonly string[] = [
  '',
  '4 2',
  '2 2',
  '6 3 2 3',
  '8 4',
  '3 1',
] as const;

export function monoChartStroke(index: number): string {
  return monoChartStrokePatterns[index % monoChartStrokePatterns.length];
}

/**
 * Recharts grid/axis defaults — neutral border + muted-foreground labels.
 */
export const monoChartAxis = {
  stroke: 'hsl(var(--border))',
  tick: { fill: 'hsl(var(--muted-foreground))', fontSize: 12 },
} as const;

export const monoChartGrid = {
  stroke: 'hsl(var(--border))',
  strokeDasharray: '3 3',
} as const;
