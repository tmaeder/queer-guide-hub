import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('personality quality summary contract', () => {
  it('does not present archived or rejected guard history as actionable review work', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/hooks/usePersonalityQualitySummary.ts'),
      'utf8',
    );

    expect(source).toContain(".eq('needs_attention', true)");
    expect(source).toContain(
      ".or('review_status.is.null,review_status.not.in.(archived,rejected)')",
    );
  });
});
