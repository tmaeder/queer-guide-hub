import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MIGRATION = 'supabase/migrations/99991795354938_event_programme_link_parent_ref.sql';

// Comments stripped: the header quotes the rules being asserted.
const sql = readFileSync(MIGRATION, 'utf8')
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .toLowerCase();

const umbrella = sql.slice(sql.indexOf('umbrella as ('), sql.indexOf('ref as ('));
const ref = sql.slice(sql.indexOf('ref as ('), sql.indexOf('cand_ref as ('));
const candRef = sql.slice(sql.indexOf('cand_ref as ('), sql.indexOf('cand_title as ('));
const candTitle = sql.slice(sql.indexOf('cand_title as ('), sql.indexOf('cand as ('));

describe('programme linker: parent_ref arm', () => {
  it('slices every CTE (positive control)', () => {
    for (const part of [umbrella, ref, candRef, candTitle]) expect(part.length).toBeGreaterThan(80);
  });

  it('keeps every umbrella guard from 99991795346462, shared by both arms', () => {
    expect(umbrella).toContain('not p.is_standing');
    expect(umbrella).toContain("p.end_date - p.start_date <= interval '62 days'");
    expect(candRef).toContain('join umbrella p');
    expect(candTitle).toContain('from umbrella p');
    expect(candTitle).toContain('c.end_date - c.start_date < 0.5 * (p.end_date - p.start_date)');
  });

  it('refuses an EventSeries ref: a recurring show is not a festival', () => {
    expect(ref).toContain("<> 'eventseries'");
  });

  it('matches by url or by year-stripped name, inside the span, near the umbrella', () => {
    expect(candRef).toContain('r.ref_url in (p.website, p.ticket_url)');
    expect(candRef).toMatch(
      /r\.ref_name = nullif\(regexp_replace\(public\.dedup_despace\(p\.title\)/,
    );
    expect(candRef).toContain('<= 25000');
    expect(candRef).toContain('c.start_date >= p.start_date');
  });

  it('never lets the title heuristic override a publisher-placed child', () => {
    expect(candTitle).toContain('not exists (select 1 from cand_ref r where r.child_id = c.id)');
  });

  it('re-types only rows still typed other', () => {
    const retype = sql.slice(sql.indexOf('update public.events e'), sql.indexOf('do $verify$'));
    expect(retype).toContain("and e.event_type = 'other'");
  });
});
