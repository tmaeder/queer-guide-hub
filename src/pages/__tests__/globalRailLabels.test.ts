import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

// Rails that are not filtered by the page's city must say so, rather than read
// as local under a "… in {{city}}" heading.
describe('unscoped rails carry a worldwide label', () => {
  it.each(['../Venues.tsx', '../Events.tsx'])('%s titles its GuidesRail worldwide', (p) => {
    expect(src(p)).toMatch(/<GuidesRail\s+title=\{t\('guides\.rail\.titleWorldwide'/);
  });

  it('People labels its groups as not city-scoped', () => {
    expect(src('../people/People.tsx')).toContain("'people.sections.groupsKickerWorldwide'");
  });
});
