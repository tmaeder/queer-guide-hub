import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('useCockpitOps production schema contract', () => {
  it('reads the real 24-hour column from pipeline_error_summary', () => {
    const source = readFileSync(join(process.cwd(), 'src/hooks/useCockpitOps.ts'), 'utf8');

    expect(source).toContain("select('function_name, last_24h')");
    expect(source).toContain('e.last_24h ?? 0');
    expect(source).not.toContain('errors_24h');
  });
});
