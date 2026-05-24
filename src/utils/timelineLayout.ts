export interface Placeable {
  id: string;
  startMs: number;
  endMs: number;
}

export interface Placed<T extends Placeable> {
  item: T;
  row: number;
  startMs: number;
  endMs: number;
}

export function placeOnRows<T extends Placeable>(
  items: T[],
  pxForMs: (ms: number) => number,
  minLabelPx: number,
): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.startMs - b.startMs);
  const rowEnds: number[] = [];
  const out: Placed<T>[] = [];
  for (const it of sorted) {
    const startPx = pxForMs(it.startMs);
    const endPx = Math.max(pxForMs(it.endMs), startPx + minLabelPx);
    let row = 0;
    while (rowEnds[row] !== undefined && startPx < rowEnds[row]) row++;
    rowEnds[row] = endPx;
    out.push({ item: it, row, startMs: it.startMs, endMs: it.endMs });
  }
  return out;
}

export type ColumnUnit = 'day' | 'week' | 'month' | 'quarter';

export function pickColumnUnit(rangeMs: number): ColumnUnit {
  const DAY = 86_400_000;
  if (rangeMs <= 14 * DAY) return 'day';
  if (rangeMs <= 90 * DAY) return 'week';
  if (rangeMs <= 730 * DAY) return 'month';
  return 'quarter';
}
