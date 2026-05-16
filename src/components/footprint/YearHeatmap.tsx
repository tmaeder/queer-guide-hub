import { useMemo } from 'react';

interface Mark {
  marked_at: string;
  mark_type: string;
}

interface Props {
  marks: Mark[];
}

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export function YearHeatmap({ marks }: Props) {
  const { years, counts, max } = useMemo(() => {
    const map = new Map<number, number[]>();
    let mx = 0;
    marks
      .filter((m) => m.mark_type === 'visited')
      .forEach((m) => {
        const d = new Date(m.marked_at);
        if (isNaN(d.getTime())) return;
        const y = d.getFullYear();
        const mo = d.getMonth();
        if (!map.has(y)) map.set(y, Array(12).fill(0));
        const row = map.get(y)!;
        row[mo] += 1;
        if (row[mo] > mx) mx = row[mo];
      });
    const yrs = Array.from(map.keys()).sort((a, b) => b - a);
    return { years: yrs, counts: map, max: mx };
  }, [marks]);

  if (years.length === 0) return null;

  const intensity = (n: number) => {
    if (n === 0) return 'bg-foreground/5';
    const step = max <= 1 ? 1 : n / max;
    if (step >= 0.8) return 'bg-foreground/90';
    if (step >= 0.6) return 'bg-foreground/70';
    if (step >= 0.4) return 'bg-foreground/50';
    if (step >= 0.2) return 'bg-foreground/30';
    return 'bg-foreground/15';
  };

  return (
    <div className="overflow-x-auto" data-testid="footprint-heatmap">
      <table className="border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="w-10" />
            {MONTHS.map((m, i) => (
              <th key={i} className="text-muted-foreground font-normal w-5 text-center">
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map((y) => {
            const row = counts.get(y)!;
            return (
              <tr key={y}>
                <td className="text-muted-foreground pr-2 text-right">{y}</td>
                {row.map((n, i) => (
                  <td key={i}>
                    <div
                      className={`w-5 h-5 ${intensity(n)}`}
                      title={`${y}-${String(i + 1).padStart(2, '0')}: ${n}`}
                      aria-label={`${y} month ${i + 1}: ${n} visits`}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
