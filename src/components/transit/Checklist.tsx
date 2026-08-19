import { cn } from '@/lib/utils';

export interface ChecklistStep {
  id: string;
  title: string;
  detail?: string | null;
  /** e.g. "6-8 weeks" — the wait AFTER this step. */
  wait?: string | null;
  /** e.g. "Form C1" — the actual form number, not a description of it. */
  form?: string | null;
  /** True when the step can be completed by post / without appearing. */
  byPost?: boolean;
}

/**
 * Module 06 — "Numbered steps with wait times, form numbers, and what can be
 * done by post." Conditional on Countries and Pages.
 *
 * Every field here exists because of who reads it. A trans person planning a
 * legal name change needs the form NUMBER (not "the relevant form"), the WAIT
 * (so they can sequence around it), and specifically whether they must appear
 * in person — which in a hostile jurisdiction is the difference between a
 * possible process and an unsafe one. A generic step list drops exactly those
 * three and keeps the prose.
 */
export function Checklist({ steps, className }: { steps: ChecklistStep[]; className?: string }) {
  if (steps.length === 0) return null;

  return (
    <ol className={cn('list-none bg-muted rounded-element p-0', className)}>
      {steps.map((s, i) => (
        <li
          key={s.id}
          className="flex items-start gap-4 border-b border-foreground/15 px-4 py-4 last:border-b-0"
        >
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border-hairline text-xs2 font-bold"
          >
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-title font-bold leading-tight">{s.title}</div>
            {s.detail && <p className="mt-1 text-13 leading-relaxed">{s.detail}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {s.form && (
                <span className="bg-muted rounded-element px-2 py-1 text-2xs font-bold uppercase tracking-label">
                  {s.form}
                </span>
              )}
              {s.wait && (
                <span className="bg-muted rounded-element px-2 py-1 text-2xs font-bold uppercase tracking-label">
                  Wait {s.wait}
                </span>
              )}
              {s.byPost && (
                <span className="bg-foreground px-2 py-1 text-2xs font-bold uppercase tracking-label text-background">
                  By post
                </span>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
