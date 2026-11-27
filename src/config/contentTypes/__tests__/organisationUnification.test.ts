import { describe, expect, it } from 'vitest';
import { contentTypeRegistry, getContentTypeIds, getContentType } from '..';
import { submissionRegistry } from '@/config/submissionRegistry';
import { validateOrganisationLocations } from '@/lib/cms/organisationLocations';

const branch = {
  name: 'Bar',
  address: 'Example Street',
  city: 'Zurich',
  country: 'Switzerland',
  category: 'bar',
};
describe('one organisation content type', () => {
  // Spots P2 folds the shadow organisations, so venues are listed as their own type again.
  it('registers organisations and venues as separate content types', () => {
    expect(getContentTypeIds()).toContain('organizations');
    expect(getContentTypeIds()).toContain('venues');
    expect(getContentType('venues')?.tableName).toBe('venues');
    expect(
      contentTypeRegistry.organizations.fields.find((field) => field.name === '_locations')
        ?.virtual,
    ).toBe(true);
  });
  it('uses one content type for organisation, venue and accommodation submissions', () => {
    for (const id of ['organization', 'venue', 'hotel'])
      expect(submissionRegistry[id].contentType).toBe('organizations');
    expect(submissionRegistry.venue.fields?.some((field) => field.name === 'address')).toBe(true);
    expect(submissionRegistry.organization.steps.flatMap((step) => step.fields)).not.toContain(
      'address',
    );
  });
  it('requires a role but no fabricated location', () => {
    const validate = contentTypeRegistry.organizations.validate!;
    expect(validate({ name: 'Support', roles: ['support'] }).isValid).toBe(true);
    expect(validate({ name: 'Support', roles: [] }).isValid).toBe(false);
    expect(
      validate({
        roles: ['advocacy'],
        founded_at: '2020-01-01',
        dissolved_at: '2019-01-01',
        is_defunct: true,
      }).isValid,
    ).toBe(false);
  });
  it('validates new/changed locations while leaving unchanged legacy rows editable at identity level', () => {
    expect(validateOrganisationLocations([branch], [])).toBeNull();
    expect(validateOrganisationLocations([{ ...branch, name: '' }], [])).toBeTruthy();
    const legacy = { id: 'old', name: 'Legacy venue', category: 'other' };
    expect(validateOrganisationLocations([legacy], [legacy])).toBeNull();
  });
});
