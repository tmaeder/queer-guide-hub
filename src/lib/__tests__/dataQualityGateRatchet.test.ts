import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = readFileSync(join(process.cwd(), 'scripts/check-data-quality-gates.mjs'), 'utf8');
const baseline = JSON.parse(
  readFileSync(join(process.cwd(), 'scripts/data-quality-gate-baseline.json'), 'utf8'),
) as Record<string, unknown>;

describe('critical data-quality backlog ratchet', () => {
  it('keeps zero tolerance by default and only exempts an explicit shrinking ceiling', () => {
    expect(script).toContain('criticalCeilings[r.gate] ?? 0');
    expect(script).toContain('n > ceiling');
    expect(script).toContain('lower the committed ceiling');
    expect(baseline.personality_unsupported_claim).toBe(226);
    expect(Object.keys(baseline).filter((key) => !key.startsWith('_'))).toEqual([
      'personality_unsupported_claim',
    ]);
  });
});
