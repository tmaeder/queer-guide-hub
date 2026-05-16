import { describe, it, expect } from 'vitest';
import { renderPopupHTML } from '../ExploreMapPopup';

describe('renderPopupHTML', () => {
  it('returns html for a basic marker', () => {
    const html = renderPopupHTML({ id: '1', name: 'X', kind: 'venue' } as never);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
  });
});
