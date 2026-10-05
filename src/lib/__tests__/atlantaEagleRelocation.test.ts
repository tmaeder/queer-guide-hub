import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards 99991791188290_atlanta_eagle_relocation.sql.
//
// The Atlanta Eagle moved from 306 Ponce De Leon to 1492 Piedmont Ave NE, and we
// kept publishing the old address, phone and hours with no social links. What
// must not drift:
//   1. the UPDATE is content-guarded on the stale address (a human fix wins)
//   2. prior values are preserved on the row, not overwritten silently
//   3. coordinates come from the row's own gayout payload, not a guess
//   4. the Mixx rows in the same building are asserted untouched — same street
//      number, different business; merging them is the failure this guards
//   5. the cohort sentinel is service_role only and REPORTS, never flags
//      needs_attention (that would demote ~590 venues to draft)
//   6. the health-script section runs BEFORE the final process.exit(1)

const MIGRATION = '99991791188290_atlanta_eagle_relocation.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');
const statements = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const verifyAt = statements.indexOf('do $verify$');
const body = statements.slice(0, verifyAt);
const verify = statements.slice(verifyAt);
const update = body.slice(body.indexOf('update public.venues v'), body.indexOf('insert into public.unified_tag_assignments'));

const EAGLE = '91c28809-8e79-4251-b3d8-f3f08e7f0d01';
const MIXX_A = 'b06a47dc-5399-43f4-bfc9-60ade96bc5dd';
const MIXX_B = 'b46aa288-7e6d-42fe-8534-b8d992516a31';

describe('spans', () => {
  it('found the update and the postconditions', () => {
    expect(update.length).toBeGreaterThan(800);
    expect(verify.length).toBeGreaterThan(800);
  });
});

describe('the venue update', () => {
  it('is scoped to the Eagle row and guarded on the stale address', () => {
    expect(update).toContain(`v.id = '${EAGLE}'`);
    expect(update).toMatch(/and v\.address ilike '306 Ponce%'/);
    expect(update).toMatch(/and v\.duplicate_of_id is null/);
  });

  it('preserves the prior values under relocation_repair.from', () => {
    expect(update).toMatch(/'relocation_repair'/);
    for (const col of ['address', 'phone', 'hours', 'category', 'description', 'social_links']) {
      expect(update).toContain(`'${col}', v.${col}`);
    }
  });

  it('takes coordinates from the gayout payload', () => {
    expect(update).toMatch(/latitude\s+= 33\.7960463/);
    expect(update).toMatch(/longitude\s+= -84\.3710166/);
  });

  it('writes facebook, instagram and twitter (x.com) social links', () => {
    expect(update).toContain("'facebook',  'https://www.facebook.com/atlantaeagle'");
    expect(update).toContain("'instagram', 'https://www.instagram.com/atlantaeagle'");
    expect(update).toContain("'twitter',   'https://x.com/atlantaeagle'");
  });

  it('never touches the Mixx rows in the body', () => {
    expect(body).not.toContain(MIXX_A);
    expect(body).not.toContain(MIXX_B);
  });
});

describe('the sentinel', () => {
  it('is granted to service_role only', () => {
    expect(body).toMatch(
      /revoke all on function public\.venue_source_location_signals\(\) from public, anon, authenticated;/,
    );
    expect(body).toMatch(/grant execute on function public\.venue_source_location_signals\(\) to service_role;/);
  });

  it('does not write needs_attention anywhere', () => {
    expect(statements).not.toMatch(/needs_attention/);
  });
});

describe('postconditions', () => {
  it('assert the old address and phone are gone, and RAISE', () => {
    expect(verify).toMatch(/address ilike '%306 Ponce%' or postal_code = '30303' or phone = '\+14048732453'/);
    expect(verify).toMatch(/if v_bad <> 0 then\s+raise exception 'atlanta eagle P1/);
  });

  it('assert both Mixx rows are unchanged and unmerged, and RAISE', () => {
    expect(verify).toContain(MIXX_A);
    expect(verify).toContain(MIXX_B);
    expect(verify).toMatch(/if v_bad <> 2 then\s+raise exception 'atlanta eagle P3/);
  });

  it('refuse a sentinel that measured nothing', () => {
    expect(verify).toMatch(/venues_checkable'\)::int, 0\) = 0 then\s+raise exception 'atlanta eagle P4/);
  });

  it('contain no short-circuited predicate', () => {
    expect(verify).not.toMatch(/where false|if \(?false\)? then/i);
  });
});

describe('health script', () => {
  const script = readFileSync(join(process.cwd(), 'scripts/check-pipeline-health.mjs'), 'utf8');
  it('calls the sentinel before the final exit', () => {
    const call = script.indexOf('/rest/v1/rpc/venue_source_location_signals');
    const exit = script.lastIndexOf('process.exit(1)');
    expect(call).toBeGreaterThan(0);
    expect(call).toBeLessThan(exit);
  });
});
