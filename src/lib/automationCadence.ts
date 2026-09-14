/**
 * Worst-case wait before the next drain, read from the jobs' own schedules.
 *
 * Derived rather than hardcoded: the card exists to stop the queues being
 * misdescribed, so a copy string saying "every 5 minutes" that outlived a
 * cadence change would be the same defect one layer up. `*\/N * * * *` and the
 * offset form `A-59/N * * * *` both mean "every N minutes"; anything else
 * (a fixed hour-of-day) is reported as the nightly window it is.
 */
export function cadenceLabel(jobs: Record<string, { enabled: boolean; schedule: string | null }>) {
  const mins: number[] = [];
  let nightly = false;
  for (const j of Object.values(jobs ?? {})) {
    if (!j?.enabled || !j.schedule) continue;
    const m = /^(?:\*|\d+-\d+)\/(\d+) \* \* \* \*$/.exec(j.schedule.trim());
    if (m) mins.push(Number(m[1]));
    else nightly = true;
  }
  if (nightly) return 'next pass tonight';
  if (!mins.length) return null;
  return `next pass within ${Math.max(...mins)} min`;
}
