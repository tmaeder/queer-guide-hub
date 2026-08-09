interface LineStepperProps {
  steps: string[];
  /** Index of the current step; it and everything before it render as done. */
  current: number;
  className?: string;
}

/** Progress is always a bending line with stations — onboarding, submit
 *  flows, quests. Filled = done, ringed = ahead. */
export function LineStepper({ steps, current, className }: LineStepperProps) {
  const n = steps.length;
  const xs = steps.map((_, i) => (n === 1 ? 150 : 20 + (260 * i) / (n - 1)));
  return (
    <div className={className} role="group" aria-label={`Step ${current + 1} of ${n}: ${steps[current]}`}>
      <svg viewBox="0 0 300 40" className="w-full" aria-hidden>
        <path
          d="M 8 22 C 60 16 110 26 150 21 C 190 16 240 26 292 19"
          fill="none"
          stroke="hsl(var(--track-green))"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {xs.map((x, i) => (
          <circle
            key={i}
            cx={x}
            cy={21}
            r={8}
            fill={i <= current ? 'hsl(var(--foreground))' : 'hsl(var(--background))'}
            stroke="hsl(var(--foreground))"
            strokeWidth={3}
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs2 font-bold">
        {steps.map((s, i) => (
          <span key={s} className={i <= current ? '' : 'text-muted-foreground'}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
