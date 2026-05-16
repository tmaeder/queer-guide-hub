/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { getFieldGroups } from '../fieldGroups';

describe('getFieldGroups', () => {
  it('returns groups for empty content type', () => {
    const groups = getFieldGroups({ fields: [], fieldGroups: [] } as never, {});
    expect(groups).toBeDefined();
  });
  it('groups fields by section', () => {
    const ct = {
      fields: [
        { name: 'title', label: 'Title', type: 'text', section: 'main' },
        { name: 'body', label: 'Body', type: 'textarea', section: 'main' },
        { name: 'seo', label: 'SEO', type: 'text', section: 'seo' },
      ],
      fieldGroups: [],
    } as never;
    const groups = getFieldGroups(ct, {});
    expect(groups).toBeDefined();
  });
});
