import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { carriesTimeOfDay, isSingleDay, prideScheduleWarnings } from './pride-rules.ts'

/**
 * The load-bearing half of this suite is the POSITIVE CONTROLS: a recalibration
 * that silences a rule everywhere is indistinguishable from deleting it, and
 * every "no warning" assertion below would pass against a function that returns
 * `[]` unconditionally. So each group asserts both directions — the rule still
 * fires where it applies, and is silent only where the row cannot answer it.
 */

const pride = (startStr: string, endStr = '') =>
  prideScheduleWarnings({ eventType: 'pride', startStr, endStr })

// ─── the rules still work where they apply ──────────────────────────────────

Deno.test('a single-day timed pride at an odd hour still raises BOTH warnings', () => {
  // Tuesday 2026-10-06, 03:00 UTC — the case the rules exist for.
  assertEquals(pride('2026-10-06T03:00:00Z'), ['W_PRIDE_TIME_WINDOW', 'W_PRIDE_NOT_SATURDAY'])
})

Deno.test('a single-day timed pride inside the window on a Saturday raises nothing', () => {
  // Saturday 2026-10-03, 11:00 UTC — a well-formed parade.
  assertEquals(pride('2026-10-03T11:00:00Z'), [])
})

Deno.test('the time window is still enforced at both edges', () => {
  // Saturdays, so only the hour can contribute.
  assertEquals(pride('2026-10-03T09:59:00Z'), ['W_PRIDE_TIME_WINDOW'])
  assertEquals(pride('2026-10-03T10:00:00Z'), [])
  assertEquals(pride('2026-10-03T15:00:00Z'), [])
  assertEquals(pride('2026-10-03T16:00:00Z'), ['W_PRIDE_TIME_WINDOW'])
})

Deno.test('a timed weekday parade still raises the Saturday warning alone', () => {
  // Friday 2026-10-02, 12:00 UTC — good hour, wrong day.
  assertEquals(pride('2026-10-02T12:00:00Z'), ['W_PRIDE_NOT_SATURDAY'])
})

// ─── the recalibration: applicability, not leniency ─────────────────────────

Deno.test('a date-only start raises NO time-of-day warning', () => {
  // THE MEASURED DEFECT. A bare date parses to midnight UTC, and midnight is
  // trivially outside 10:00-15:00, so this fired on 578 rows across 12 sources
  // while reporting the source's date format rather than the event's schedule.
  // 2026-10-03 is a Saturday, so nothing else can contribute here.
  assertEquals(pride('2026-10-03'), [])
})

Deno.test('a date-only start on a weekday still raises the Saturday warning', () => {
  // Scope check: losing the time of day must not also lose the day of the week.
  // Tuesday 2026-10-06, single day.
  assertEquals(pride('2026-10-06'), ['W_PRIDE_NOT_SATURDAY'])
})

Deno.test('a multi-day festival raises NO Saturday warning', () => {
  // Maspalomas Fetish Pride runs 1-12 October 2026 and begins on a Thursday.
  // A twelve-day festival legitimately does not start on a Saturday.
  assertEquals(pride('2026-10-01', '2026-10-12'), [])
})

Deno.test('a multi-day festival that IS timed still gets the time-of-day check', () => {
  // The two rules are independent: being multi-day excuses the weekday, not the
  // clock. Thursday 2026-10-01 at 04:00 with a real time given.
  assertEquals(pride('2026-10-01T04:00:00Z', '2026-10-12T23:00:00Z'), ['W_PRIDE_TIME_WINDOW'])
})

Deno.test('an explicit midnight WITH a clock is still judged', () => {
  // The distinction is "did the source state a time", not "is the time
  // midnight". A source that really says 00:00 is making a claim, and
  // Ticketmaster does this on 31 rows. Saturday, so only the hour contributes.
  assertEquals(pride('2026-10-03T00:00:00Z'), ['W_PRIDE_TIME_WINDOW'])
})

// ─── scope ──────────────────────────────────────────────────────────────────

Deno.test('the rules govern pride and protest only', () => {
  // Tuesday, date-only, so both rules would have something to say if they applied.
  for (const et of ['pride', 'protest']) {
    assertEquals(
      prideScheduleWarnings({ eventType: et, startStr: '2026-10-06', endStr: '' }),
      ['W_PRIDE_NOT_SATURDAY'],
      `${et} must be governed`,
    )
  }
  for (const et of ['festival', 'party', 'fetish', 'film', 'other', '']) {
    assertEquals(
      prideScheduleWarnings({ eventType: et, startStr: '2026-10-06T03:00:00Z', endStr: '' }),
      [],
      `${et} must not be governed`,
    )
  }
})

Deno.test('event_type matching is case-insensitive', () => {
  assertEquals(
    prideScheduleWarnings({ eventType: 'PRIDE', startStr: '2026-10-06', endStr: '' }),
    ['W_PRIDE_NOT_SATURDAY'],
  )
})

Deno.test('an unparseable or missing start yields nothing rather than guessing', () => {
  assertEquals(pride(''), [])
  assertEquals(pride('not a date'), [])
})

// ─── the two predicates, directly ───────────────────────────────────────────

Deno.test('carriesTimeOfDay distinguishes a stated time from a bare date', () => {
  assertEquals(carriesTimeOfDay('2026-10-03'), false)
  assertEquals(carriesTimeOfDay('2026-10-03T00:00:00Z'), true)
  assertEquals(carriesTimeOfDay('2026-10-03T18:30'), true)
  assertEquals(carriesTimeOfDay('2026-10-03T18:00:00+02:00'), true)
  assertEquals(carriesTimeOfDay('  2026-10-03  '), false)
})

Deno.test('isSingleDay treats an absent end date as single-day', () => {
  // Load-bearing: a parade often has no end date, and calling that multi-day
  // would silently drop the Saturday check for exactly the rows it covers.
  assertEquals(isSingleDay('2026-10-03', ''), true)
  assertEquals(isSingleDay('2026-10-03', '2026-10-03'), true)
  assertEquals(isSingleDay('2026-10-03', '2026-10-04'), false)
  // Same calendar day, different clock times, is still one day.
  assertEquals(isSingleDay('2026-10-03T10:00:00Z', '2026-10-03T22:00:00Z'), true)
})
