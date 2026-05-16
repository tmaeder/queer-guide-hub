import { describe, it, expect } from 'vitest';
import * as fields from '../index';

describe('profile/settings/fields barrel', () => {
  it('re-exports', () => {
    expect(fields.FormField).toBeDefined();
    expect(fields.SelectField).toBeDefined();
    expect(fields.SwitchField).toBeDefined();
  });
});
