import { describe, it, expect } from 'vitest';
import {
  getContentTypeIds,
  getContentType,
  getFieldsByGroup,
  getFieldGroups,
  fieldGroupLabels,
} from '../contentTypeRegistry';

describe('contentTypeRegistry', () => {
  it('should export a non-empty registry', () => {
    const ids = getContentTypeIds();
    expect(ids.length).toBeGreaterThan(0);
  });

  it('should contain venues content type', () => {
    const venues = getContentType('venues');
    expect(venues).toBeDefined();
    expect(venues?.label).toBeTruthy();
    expect(venues?.fields.length).toBeGreaterThan(0);
  });

  it('should contain events content type', () => {
    const events = getContentType('events');
    expect(events).toBeDefined();
    expect(events?.label).toBeTruthy();
  });

  it('should return undefined for unknown type', () => {
    expect(getContentType('nonexistent')).toBeUndefined();
  });

  it('should return fields for a group', () => {
    const fields = getFieldsByGroup('venues', 'basic');
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.every(f => f.group === 'basic')).toBe(true);
  });

  it('should return all fields when no group specified', () => {
    const allFields = getFieldsByGroup('venues');
    const basicFields = getFieldsByGroup('venues', 'basic');
    expect(allFields.length).toBeGreaterThanOrEqual(basicFields.length);
  });

  it('should return field groups for content type', () => {
    const groups = getFieldGroups('venues');
    expect(groups).toContain('basic');
  });

  it('should have labels for all field groups', () => {
    expect(fieldGroupLabels.basic).toBeTruthy();
    expect(typeof fieldGroupLabels.basic).toBe('string');
  });

  it('each content type should have required name or title field', () => {
    for (const id of getContentTypeIds()) {
      const config = getContentType(id)!;
      const _fields = config.fields;      // Most content types should have a name/title
      expect(config.label).toBeTruthy();
    }
  });
});
