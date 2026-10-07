import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991791314322: 14 hand-read Zürich venue duplicates (same address,
 * name variant) merged through `_venue_merge_core`.
 *
 * Text check against the migration — no credentials. Comments are stripped
 * first, because the header names the excluded pairs (Club Q) and the shape of
 * the fix; an unstripped search would match the prose.
 */

const MIGRATION = '99991791314322_zuerich_venue_address_duplicates_merge';
const raw = readFileSync(join(process.cwd(), 'supabase', 'migrations', `${MIGRATION}.sql`), 'utf8');
const sql = raw
  .split('\n')
  .map((l) => l.replace(/\s--.*$/, '').replace(/^--.*$/, ''))
  .join('\n');

const PAIRS: Array<[string, string]> = [
  ['b2809f36-0c14-49a6-b949-f4580d0149da', 'ed50b926-4654-4669-9a19-a424f992b1b1'],
  ['60a2f890-1a17-40f3-8486-d091d6029142', 'eb8d95ac-a43f-4ee1-b887-2d086a6fa724'],
  ['025720aa-c9de-4d3d-ad1a-038a5bb23691', 'a914e626-248b-40f5-945c-b7f128804c34'],
  ['fc5513ca-4403-4da4-a9dd-6f3fb4566650', 'bc8eb315-f57f-483f-ac9d-552fec7442d3'],
  ['2ba0c050-295b-4660-86a6-ef730f009a7f', '001a916c-7b99-4453-8966-6efd2e4f2000'],
  ['9be65a2c-a21d-4e68-b968-83db9192c4b9', '45b10462-5e08-4414-bf36-6c031b16b716'],
  ['23035907-c690-437a-8147-d3627cc6ecfb', '5fc66620-fde1-431c-985e-8c5afaacc599'],
  ['734861c6-305c-4664-b609-acf06e275a05', '218e802b-65cc-49f7-9d02-8d5fe8f8b6c3'],
  ['734861c6-305c-4664-b609-acf06e275a05', '2b87175e-a59a-4431-bdec-c4b570e829db'],
  ['d0463ceb-cc78-48b9-8901-e711458fa0cb', 'c01b02ff-5a65-41c9-b80c-0d26e5cfde84'],
  ['4cbcc091-6b63-41cf-96cd-a043062cf8d7', 'ffce8557-48f1-4a70-9016-d99ee7b800fc'],
  ['92afbdb5-4432-4c2d-a8d1-7a0bff8a40ba', 'd1ebafcd-9988-450b-8d95-8b38a631046f'],
  ['1db9a34d-e4e5-4ebf-b209-02e046f50340', 'bc6336e6-26f3-4486-9b4a-56611626f53e'],
  ['e7907a31-1c89-4507-b019-a34fc0b86fae', '562b7394-8cb4-426a-9b71-84599f3074f8'],
];

const mergeBlock = sql.slice(sql.indexOf('do $merge$'), sql.indexOf('$merge$;'));
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('zuerich venue duplicate merge', () => {
  it('carries exactly the 14 reviewed pairs, keep first', () => {
    const tuples = [...sql.matchAll(/\('([0-9a-f-]{36})',\s*'([0-9a-f-]{36})'\)/g)].map((m) => [m[1], m[2]]);
    expect(tuples).toEqual(PAIRS);
  });

  it('does not merge Club Q (may be a party series at Queens Club)', () => {
    expect(sql).not.toContain('b9edf453-4d1c-436b-9352-3dba59e3a7ac');
  });

  it('fills keep fields BEFORE the merge, since the core copies none', () => {
    const fill = mergeBlock.indexOf('update public.venues v');
    const merge = mergeBlock.indexOf('perform public._venue_merge_core(k.id, d.id, null)');
    expect(fill).toBeGreaterThan(-1);
    expect(merge).toBeGreaterThan(fill);
    expect(mergeBlock).toMatch(/nullif\(btrim\(v\.website\), ''\) is null then nullif\(btrim\(d\.website\)/);
  });

  it('skips moved rows instead of aborting db push', () => {
    expect((mergeBlock.match(/continue;/g) ?? []).length).toBe(5);
    expect(mergeBlock).not.toMatch(/raise exception/i);
  });

  it('asserts the defect is gone, reversibility and event reparenting', () => {
    expect((verify.match(/if v_bad <> 0 then/g) ?? []).length).toBe(3);
    expect(verify).toContain("a.details ->> 'schema' = '1'");
    expect(verify).toContain('join public.events e on e.venue_id = d.id');
    expect(verify).not.toMatch(/where false/i);
  });
});
