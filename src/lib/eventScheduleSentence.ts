const DAY_NAMES: Record<string, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
};
const DAY_ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export interface EventSchedule {
  kind?: 'opening_hours' | 'recurrence' | 'run' | string;
  tz?: string;
  weekly?: Array<{ day: string; start?: string; end?: string }>;
  monthly?: { nth: number; day: string; start?: string; end?: string };
  interval_weeks?: number;
  anchor?: string;
  until?: string | null;
  exceptions?: string[];
  confidence?: 'authored' | 'feed' | 'inferred' | string;
}

export interface ScheduleSentence {
  text: string;
  /** True when no human or feed stated this — the cadence was derived from observed dates. */
  inferred: boolean;
}

/**
 * One line describing when a thing is on.
 *
 * WHY THIS EXISTS. `events.schedule` carries 141 rules on prod and `event_dates`
 * 7,353 expanded dates, and NOTHING client-side reads either — the model shipped,
 * the inference shipped, and a reader still sees only `start_date`. This is the
 * surface that makes the column visible.
 *
 * DELIBERATELY NOT A LIVE "OPEN NOW" STATUS. "Open today until 18:00" needs the
 * current time in the EVENT's timezone, not the reader's, plus exception handling
 * for the dates the rule skips — and it is wrong in the most embarrassing way when
 * it disagrees with the door. This describes the RULE, which is what the data
 * actually asserts. A live status is a separate feature with its own correctness
 * problem; see the spec.
 *
 * `inferred` is returned rather than baked into the string so the caller decides how
 * to mark it. 139 of the 141 rules on prod are `inferred`, derived from observed
 * dates and never confirmed by a human, and presenting that identically to an
 * organiser-stated time would overstate what we know.
 */
export function scheduleSentence(
  schedule: EventSchedule | null | undefined,
): ScheduleSentence | null {
  if (!schedule || typeof schedule !== 'object') return null;

  const inferred = schedule.confidence === 'inferred';
  const until = formatUntil(schedule.until);

  if (schedule.monthly?.day) {
    const { nth, day, start } = schedule.monthly;
    const name = DAY_NAMES[day];
    if (!name) return null;
    const ord = nth === -1 ? 'last' : ordinal(nth);
    return {
      text: join([`Every ${ord} ${name}`, start, until]),
      inferred,
    };
  }

  const weekly = (schedule.weekly ?? []).filter((w) => DAY_NAMES[w.day]);
  if (weekly.length > 0) {
    const days = [...weekly].sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));
    const names = days.map((d) => DAY_NAMES[d.day]);
    const dayPart = listWords(names);

    // Only state one time when every day genuinely shares it. A library open
    // 11:00 on Saturday and 14:00 on Tuesday is not "Tue and Sat, 11:00", and
    // collapsing it would publish a wrong opening time.
    const starts = new Set(days.map((d) => d.start ?? ''));
    const time = starts.size === 1 ? [...starts][0] : '';
    const range = time && days[0].end ? `${time}–${days[0].end}` : time;

    const every =
      schedule.interval_weeks === 2
        ? `Every other ${dayPart}`
        : schedule.kind === 'opening_hours'
          ? `Open ${dayPart}`
          : `Every ${dayPart}`;

    return { text: join([every, range, until]), inferred };
  }

  if (schedule.kind === 'run' && until) {
    return { text: `Runs ${until}`, inferred };
  }

  return null;
}

function join(parts: Array<string | undefined>): string {
  const [head, ...rest] = parts.filter((p): p is string => Boolean(p));
  if (!head) return '';
  // Comma before a time, mid-dot before the "until" clause — the time belongs to
  // the cadence, the end date is a separate fact about it.
  return rest.reduce((acc, p) => (p.startsWith('until ') ? `${acc} · ${p}` : `${acc}, ${p}`), head);
}

function listWords(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function ordinal(n: number): string {
  const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

function formatUntil(until: string | null | undefined): string {
  if (!until) return '';
  const d = new Date(until);
  if (Number.isNaN(d.getTime())) return '';
  // Year only when it is not the current one — "until 30 June" reads better than
  // "until 30 June 2026" nine months out, and a distant end date needs the year.
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return `until ${d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: sameYear ? undefined : 'numeric',
    timeZone: 'UTC',
  })}`;
}
