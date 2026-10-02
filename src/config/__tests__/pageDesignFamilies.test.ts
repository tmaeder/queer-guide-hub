import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PAGE_DESIGN_CONTRACTS,
  pageDesignFamilyForModule,
  type PageDesignFamily,
} from '../pageDesignFamilies';

const routesSource = readFileSync(join(process.cwd(), 'src/routes.tsx'), 'utf8');
const routeModules = [...routesSource.matchAll(/import\('([^']+)'\)/g)].map((match) => match[1]);

describe('subway page-family coverage', () => {
  it('maps every lazy route module to an approved reference family', () => {
    const missing = routeModules.filter((modulePath) => !pageDesignFamilyForModule(modulePath));
    expect(missing, `Unmapped route modules:\n${missing.join('\n')}`).toEqual([]);
  });

  it('connects every mapped family to a concrete supplied reference', () => {
    const families = new Set(
      routeModules.map((modulePath) => pageDesignFamilyForModule(modulePath)).filter(Boolean),
    );
    for (const family of families) {
      expect(PAGE_DESIGN_CONTRACTS[family as PageDesignFamily].reference).toMatch(/\.dc\.html$/);
    }
  });

  it('keeps safety and admin surfaces motion-free', () => {
    expect(PAGE_DESIGN_CONTRACTS.safety.routeMotion).toBe('none');
    expect(PAGE_DESIGN_CONTRACTS.admin.routeMotion).toBe('none');
  });

  it('keeps the journey controller outside the per-route reset boundary', () => {
    const journey = routesSource.indexOf('<RouteFade>');
    const resetBoundary = routesSource.indexOf('<ErrorBoundary key={location.pathname}>');

    expect(journey).toBeGreaterThan(-1);
    expect(resetBoundary).toBeGreaterThan(journey);
  });
});
