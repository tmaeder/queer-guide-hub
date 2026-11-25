import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

// Rails that are not filtered by the page's city must say so, rather than read
// as local under a "… in {{city}}" heading.
describe('unscoped rails carry a worldwide label', () => {
  it.each(['../Venues.tsx', '../Events.tsx'])('%s titles its GuidesRail worldwide', (p) => {
    expect(src(p)).toMatch(/<GuidesRail\s+title=\{t\('guides\.rail\.titleWorldwide'/);
  });

  // People had a worldwide groups rail; #5747 removed the section, so there is
  // no unscoped rail left there to label.
});
