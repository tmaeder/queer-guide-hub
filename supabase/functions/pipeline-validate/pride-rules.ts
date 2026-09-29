// ============================================================
// Pride / protest schedule rules.
//
// Extracted out of index.ts so they can be exercised by `deno test` without
// booting the handler. Behaviour for a row the rules genuinely APPLY to is
// unchanged — a single-day pride that carries a clock still gets both checks.
//
// WHAT THESE RULES ARE FOR. They mirror the `pride_demo_*` entries in
// `automation_rules`: a city pride PARADE is a single-day march that steps off
// mid-morning on a Saturday, so a 03:00 start or a Tuesday date is worth a
// human look. That is a good rule about a parade.
//
// WHY THEY WERE RECALIBRATED (2026-09-28). They were evaluated on every row
// whose `event_type` is pride or protest, regardless of whether the row could
// answer the question being asked, and the result was that they measured the
// SOURCE's date format rather than the event's schedule.
//
// Measured across `ingestion_staging` at the time of the change — 894 rows
// carried `W_PRIDE_TIME_WINDOW`:
//     578  start value is a bare `YYYY-MM-DD`, i.e. carries NO time of day
//     178  carries a clock
//     146  of those are genuinely at an odd hour — the rule working
// A date-only start parses to midnight UTC, and midnight is trivially outside
// 10:00-15:00, so the warning fired on 100% of date-only pride rows. It was
// reporting "this source does not publish start times", which is not what its
// name claims and not something a reviewer can act on.
//
// It spanned twelve sources, not one: queerde 385, ticketmaster 153,
// gaycities 131, gaytravel4u 108, gayout 80, and a tail. So this is a
// corpus-wide miscalibration rather than a quirk of any single importer, and
// keying the fix on a source or on a `mega_event` flag would have left the
// other ~814 rows mis-gated while looking fixed.
//
// THE FIX IS APPLICABILITY, NOT LENIENCY. Neither rule is relaxed for any row
// that can actually answer it:
//   * the time-of-day check is skipped when the start carries no time of day —
//     declining to measure something that is not present, not forgiving a bad
//     value;
//   * the Saturday check is skipped for a MULTI-DAY event, because a twelve-day
//     festival legitimately begins on a Wednesday. The rule is about a march.
//
// `W_NO_GEO` is deliberately NOT touched. "We have no coordinates" is honest,
// actionable incompleteness and should keep warning; it is the nightly
// `run_event_city_link` / `run_event_geo_fill` pass that resolves it. The reason
// these rows gated was that three warnings cross `warn_review_threshold`, and
// two of the three were inapplicable. With those two silent the remaining one
// is recorded on the row without gating it, which is what a warning is for.
// ============================================================

export interface PrideRuleInput {
  /** `normalized.event_type`, any casing. */
  eventType: string
  /** `normalized.start_date` or `normalized.dates.start`, as the source gave it. */
  startStr: string
  /** `normalized.end_date` or `normalized.dates.end`; empty when open-ended. */
  endStr: string
}

/** These rules describe a march. Other event types are out of scope entirely. */
const GOVERNED_TYPES = new Set(['pride', 'protest'])

/**
 * Does this value carry a time of day at all?
 *
 * A bare `YYYY-MM-DD` does not. Anything with a `T` followed by an hour does.
 * This is deliberately a test of the SOURCE STRING rather than of the parsed
 * Date: a parsed date-only value is indistinguishable from a genuine midnight
 * start once it becomes a timestamp, which is exactly how the old rule came to
 * treat "no time given" as "starts at 00:00".
 */
export const carriesTimeOfDay = (startStr: string): boolean => /T\d{2}:/.test(startStr.trim())

/**
 * Is this a single-day event?
 *
 * Open-ended (no end date) counts as single-day: that is what a parade looks
 * like, and treating an absent end date as multi-day would silently drop the
 * Saturday check for the rows it exists to cover.
 */
export function isSingleDay(startStr: string, endStr: string): boolean {
  const start = startStr.trim().slice(0, 10)
  const end = endStr.trim().slice(0, 10)
  if (!end) return true
  return end === start
}

/**
 * The warnings these rules contribute, in the order the original code pushed
 * them so existing payloads keep comparing equal.
 *
 * Returns an empty array for a row the rules do not govern or cannot judge.
 */
export function prideScheduleWarnings(input: PrideRuleInput): string[] {
  const warnings: string[] = []
  const et = String(input.eventType ?? '').toLowerCase()
  if (!GOVERNED_TYPES.has(et)) return warnings

  const startTs = input.startStr ? new Date(input.startStr).getTime() : Number.NaN
  if (!Number.isFinite(startTs)) return warnings

  const d = new Date(startTs)

  // Time-of-day rule: only where there IS a time of day.
  if (carriesTimeOfDay(input.startStr)) {
    const hour = d.getUTCHours()
    if (hour < 10 || hour > 15) warnings.push('W_PRIDE_TIME_WINDOW')
  }

  // Saturday rule: only for a single-day march.
  if (isSingleDay(input.startStr, input.endStr)) {
    if (d.getUTCDay() !== 6) warnings.push('W_PRIDE_NOT_SATURDAY')
  }

  return warnings
}
