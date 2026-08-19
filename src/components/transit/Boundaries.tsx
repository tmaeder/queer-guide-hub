import { cn } from '@/lib/utils';

export interface BoundarySet {
  into?: string[];
  notInto?: string[];
  askMe?: string[];
}

/**
 * Module 13 — "Into, not into, ask me. Written by the person, shown before any
 * thread opens." Conditional on Personalities.
 *
 * Three columns, equal weight, in that fixed order. "Not into" is NOT styled
 * as a warning or a negative: it is a boundary the person set, and rendering
 * it as an alert would frame someone's stated limit as a problem. Same border,
 * same type, same size as the other two — the only difference is the heading.
 *
 * "Shown before any thread opens" is a placement instruction for the caller:
 * this module belongs above the contact affordance, not below it.
 *
 * NOTE: no backing column exists today; renders null until one does.
 */
export function Boundaries({
  boundaries,
  className,
}: {
  boundaries: BoundarySet;
  className?: string;
}) {
  const cols = [
    { key: 'into', label: 'Into', items: boundaries.into ?? [] },
    { key: 'notInto', label: 'Not into', items: boundaries.notInto ?? [] },
    { key: 'askMe', label: 'Ask me', items: boundaries.askMe ?? [] },
  ].filter((c) => c.items.length > 0);

  if (cols.length === 0) return null;

  return (
    <div className={cn('grid grid-cols-1 gap-2 sm:grid-cols-3', className)}>
      {cols.map((c) => (
        <section key={c.key} className="bg-muted rounded-element p-4">
          <h3 className="text-title font-bold leading-none">{c.label}</h3>
          <ul className="mt-2 list-none p-0">
            {c.items.map((item) => (
              <li
                key={item}
                className="border-b border-border-hairline py-2 text-13 last:border-b-0"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
