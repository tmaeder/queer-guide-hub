import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// These edge functions read and write trip data with the service-role client,
// which bypasses RLS. Each must check the caller's access before it touches
// the trip, and must rate-limit the paid LLM call. Reads comment-stripped
// source so a header that quotes a call cannot satisfy the check.

const root = resolve(__dirname, '../../..');
const src = (fn: string) =>
  readFileSync(resolve(root, `supabase/functions/${fn}/index.ts`), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\/\/.*$/, ''))
    .join('\n');

const cases: Array<{ fn: string; firstRead: string; llm: string; limit: number }> = [
  { fn: 'trip-cost-estimate', firstRead: 'await loadTrip(admin, trip_id)', llm: 'await askClaude(', limit: 30 },
  { fn: 'trip-recap', firstRead: ".from('trip_recaps')", llm: 'await generateSummary(', limit: 20 },
  {
    fn: 'trip-safety-narrative',
    firstRead: ".from('trip_safety_briefings')",
    llm: 'await generateNarrative(',
    limit: 20,
  },
];

describe.each(cases)('$fn', ({ fn, firstRead, llm, limit }) => {
  const s = src(fn);

  it('checks trip access before reading the trip with the service-role client', () => {
    const gate = s.indexOf("if ((await tripAccess(admin, trip_id, ");
    expect(gate).toBeGreaterThan(-1);
    expect(s.indexOf(firstRead)).toBeGreaterThan(gate);
    expect(s.slice(gate, gate + 300)).toMatch(/=== 'none'\) \{\s*return new Response\([^]*?status: 404/);
  });

  it('rate-limits the caller before the LLM call', () => {
    const rl = s.indexOf(`checkUserRateLimit(req, '${fn}', ${limit}, 3600)`);
    expect(rl).toBeGreaterThan(s.indexOf("if ((await tripAccess("));
    expect(s.indexOf(llm, rl)).toBeGreaterThan(rl);
  });
});

describe('trip-inbox-slot', () => {
  const s = src('trip-inbox-slot');
  it('rate-limits the paste path after its membership check and before the LLM', () => {
    const rl = s.indexOf("checkUserRateLimit(req, 'trip-inbox-slot', 30, 3600)");
    const member = s.lastIndexOf("if (!trip) return errorResponse('forbidden', 403, req)", rl);
    const llm = s.indexOf('await anthropicMessages(');
    expect(member).toBeGreaterThan(-1);
    expect(rl).toBeGreaterThan(member);
    expect(llm).toBeGreaterThan(rl);
  });
});

describe('contact-form', () => {
  const s = src('contact-form');
  it('limits each client address, not just the email the sender types', () => {
    const ip = s.indexOf('checkIpRateLimit(req, "contact-form", 5, 3600)');
    expect(ip).toBeGreaterThan(-1);
    expect(s.indexOf('.insert(')).toBeGreaterThan(ip);
    expect(s.indexOf('sendEmail(')).toBeGreaterThan(ip);
  });
});
