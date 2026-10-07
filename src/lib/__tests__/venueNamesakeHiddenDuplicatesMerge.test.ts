import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991791392394: 33 hand-read venue duplicates that a far same-name
 * city link had hidden, merged through `_venue_merge_core`.
 *
 * Text check against the migration. Comments are stripped first, because the
 * header names the refused pairs; an unstripped search would match the prose.
 */

const MIGRATION = '99991791392394_venue_namesake_hidden_duplicates_merge';
const raw = readFileSync(join(process.cwd(), 'supabase', 'migrations', `${MIGRATION}.sql`), 'utf8');
const sql = raw
  .split('\n')
  .map((l) => l.replace(/\s--.*$/, '').replace(/^--.*$/, ''))
  .join('\n');

const PAIRS: Array<[string, string]> = [
  ['777c9947-c09c-4361-95b4-35425afb2d60', '9656e077-f141-4f64-a8dd-54f55435f068'],
  ['9ff9dc78-2526-4310-b418-192091b658b6', '1db08abe-8ffc-411c-8327-931548cd9591'],
  ['559d4333-6eea-477d-a382-8abcee6fed10', 'd69bbde4-6e13-4737-a7ff-fad6a12e5f4a'],
  ['457fcbfa-3c16-4bbc-9732-3c3def6d9d23', '14e6ec12-9fc4-407c-bd49-fac02302be18'],
  ['457fcbfa-3c16-4bbc-9732-3c3def6d9d23', '4b8323de-0bbf-43d5-b21a-daafd17d5645'],
  ['1f871172-304c-4c62-96ca-4a204bbfdf41', 'ab3f0cee-a920-4e7f-b891-1526e7f141e3'],
  ['6031f11e-e10b-4984-8ed8-7b42cccc11e9', 'b3737d62-74e4-4e6b-86d6-001f549355c8'],
  ['a6f2bf4d-fb5b-4d29-a0f8-184acb628799', 'c7ab1e38-2117-4f50-b9e9-c9d3e8c76e35'],
  ['dbe5c253-3819-4938-a92a-746c3195164b', 'ca97fe01-c560-4e79-92ab-c35da47c0f77'],
  ['7ce3cdba-a962-4859-b240-751b386c15b9', '61c06773-2bce-470a-b3ea-11357ec6bbcd'],
  ['af11175a-a174-42c0-81ca-0b0db853c24c', '2b58b764-70b5-4f70-aa21-123426b45985'],
  ['8ebff1d9-5b3c-404b-a726-d75b0c6cb845', '657422d2-f483-4f6a-b5f3-64d2686c5aca'],
  ['d7b1a705-5247-4658-a09e-78e4e5fab5f8', 'cd0fc50c-05b0-4923-9349-6a3a4c060ba9'],
  ['d7b1a705-5247-4658-a09e-78e4e5fab5f8', '61f7fa24-db70-4fce-b06b-b1c77bc08471'],
  ['d278260a-8633-4244-96e8-d2c7596acfdb', '18b5926f-e847-44f1-b984-eda7581b7e20'],
  ['5d35c9ce-7c2d-446b-b19c-51ed049233df', 'c3c50a45-8b55-45fd-84e5-7060185c23b8'],
  ['98d247fc-2435-49b0-89b6-161ee16cd537', '324e9683-3c89-424a-9573-69e844489fd1'],
  ['9f49fb63-6bd4-4e2a-835e-127e4b048912', '5b93790a-a6ae-484a-be32-a05bf19bb6cd'],
  ['5a5d2636-9cb5-4f77-89ff-b01ab01a174a', '88a7b091-9404-4984-b55c-edca46d8e21e'],
  ['0bd7ac0e-580e-447d-bf8d-8fb1feead7c0', '5e56115e-9374-46c4-9cca-1b9301ff4431'],
  ['b4fc135e-e24f-4478-bba8-c5110e368100', '818f6bf7-fb51-418a-b6ba-e007fb7d409f'],
  ['cd68aa15-2cfa-40b3-b855-37ff14f4799a', '28f4bb6c-8902-4598-a8ec-8fca9ea337bb'],
  ['71560e65-aa44-4bb8-9e5a-b1b7ed71b1e2', '26347d26-ae14-47ce-ad35-53f1188dcfc4'],
  ['cdb0838e-093d-4703-ab91-966b335396cd', 'a17c972f-3ade-404e-bea2-12a804fb2632'],
  ['27e11cde-a51e-434d-9bfa-66acd829872f', 'ef24d76e-129e-4d7f-96d1-69b037657b2c'],
  ['6521b01e-53ca-4889-9832-371e308c2d41', '7f475737-ab28-4984-8255-63f523722674'],
  ['b3f20f61-4448-47db-b27f-356fa1b06a0f', '2ff54353-51b7-463b-ae85-8201fbdd3128'],
  ['7bb5753a-934e-47ba-b3b0-1bcb4f8a0fe7', '8a721c35-b44e-4a94-9e2e-e5fea193fc04'],
  ['96081ef1-8fc0-4b4e-991c-6bf825f273e0', '177e4d2f-409c-4b8f-b0a1-16b8a84227bd'],
  ['b3761aac-326a-4e58-a1b6-4d5ae7fd2f57', '8fe3a901-d44b-40f1-805b-6a57e1e89880'],
  ['b3761aac-326a-4e58-a1b6-4d5ae7fd2f57', 'ca6527a6-7e31-4654-a47d-d8c541c982d5'],
  ['c4d9c7b6-0425-4766-8dca-6cf152b97574', '1769ba44-62c9-48ac-bc56-ed8d64c8a651'],
  ['f4daeb05-8787-4ab6-b613-23df24518364', '82f51446-ac83-4fb4-9faa-f1941bf27ed5'],
];

// Read by hand and refused — must never be merged by this file.
const REFUSED = [
  '1e24a233-a41d-4ccf-a582-b56df4d03316', // UNI Botanical Center Room 018
  '6d63fb44-f9dd-43de-9782-31636d69fb16', // UNI Botanical Center Room 016
  'f0625fb5-f263-4bda-b983-34274f02ce92', // Dillon's Russian Steam Bath (public sauna)
  '908abff5-7ab0-4411-8a33-668a4fe78217', // Dillon Russian Spa (gated cruising)
  '2a4c3828-26f2-4b78-98eb-2b748f1bae50', // The Dunes Resort (hotel)
  'e68c6f75-c6d7-4d30-940e-a6401f7e5ee4', // Dunes Resort (bar)
  '5dffa5a8-ee8c-44de-8b87-58c3a6062c4e', // Exit 5 Rest Area
  '0448d735-da68-49ad-b845-dc6ade740ab6', // Exit 6 Rest Area
  '4313b11c-5e45-4017-9ddc-618c5f9b24d7', // Nuncadigono (sauna, other address)
  'f779f33c-9461-4c6d-9f7d-cee30beb30a0', // Aquarius Sauna (other address)
];

const mergeBlock = sql.slice(sql.indexOf('do $merge$'), sql.indexOf('$merge$;'));
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('venue namesake hidden duplicate merge', () => {
  it('carries exactly the 33 reviewed pairs, keep first', () => {
    const tuples = [...sql.matchAll(/\('([0-9a-f-]{36})',\s*'([0-9a-f-]{36})'\)/g)].map((m) => [m[1], m[2]]);
    expect(tuples).toEqual(PAIRS);
    expect(PAIRS.length).toBe(33);
  });

  it('never merges a refused pair', () => {
    for (const id of REFUSED) expect(sql).not.toContain(id);
  });

  it('fills keep fields (incl. city) BEFORE the merge, since the core copies none', () => {
    const fill = mergeBlock.indexOf('update public.venues v');
    const merge = mergeBlock.indexOf('perform public._venue_merge_core(k.id, d.id, null)');
    expect(fill).toBeGreaterThan(-1);
    expect(merge).toBeGreaterThan(fill);
    expect(mergeBlock).toContain('city_id  = coalesce(v.city_id, d.city_id)');
  });

  it('skips moved rows instead of aborting db push', () => {
    expect(mergeBlock).toMatch(/haversine_m\(k\.latitude, k\.longitude, d\.latitude, d\.longitude\) > 300 then/);
    expect((mergeBlock.match(/continue;/g) ?? []).length).toBe(4);
    expect(mergeBlock).not.toMatch(/raise exception/i);
  });

  it('asserts the defect is gone, reversibility, event reparenting and the safety gate', () => {
    expect((verify.match(/if v_bad <> 0 then\s+raise exception/g) ?? []).length).toBe(4);
    expect(verify).toContain("a.details ->> 'schema' = '1'");
    expect(verify).toContain('join public.events e on e.venue_id = d.id');
    expect(verify).toContain('and not k.safety_gated');
    expect(verify).not.toMatch(/where false|if \(?false/i);
  });
});
