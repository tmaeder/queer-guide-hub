import { describe, it, expect } from 'vitest';
import * as fields from '../index';

describe('fields/index barrel', () => {
  it('re-exports all field components', () => {
    expect(fields.FieldRenderer).toBeDefined();
    expect(fields.FieldWrapper).toBeDefined();
    expect(fields.TextField).toBeDefined();
    expect(fields.TextAreaField).toBeDefined();
    expect(fields.RichTextField).toBeDefined();
    expect(fields.NumberField).toBeDefined();
    expect(fields.BooleanField).toBeDefined();
    expect(fields.SelectField).toBeDefined();
    expect(fields.MultiSelectField).toBeDefined();
    expect(fields.DateField).toBeDefined();
    expect(fields.DateTimeField).toBeDefined();
    expect(fields.ImageField).toBeDefined();
    expect(fields.ImagesField).toBeDefined();
    expect(fields.LocationField).toBeDefined();
    expect(fields.TagsField).toBeDefined();
    expect(fields.JsonField).toBeDefined();
  });
});
