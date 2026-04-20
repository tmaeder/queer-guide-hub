import { describe, it, expect } from 'vitest';
import { buildPostValidationPayload, preSubmitCheck } from '../postValidation';

describe('buildPostValidationPayload', () => {
  it('text post includes only content', () => {
    const { data, fields } = buildPostValidationPayload('text', {
      content: 'hi',
      pollOptions: ['', ''],
      linkUrl: 'x',
    });
    expect(fields).toEqual(['content']);
    expect(data).toEqual({ content: 'hi' });
    expect('pollOptions' in data).toBe(false);
  });

  it('poll post includes pollOptions as joined non-empty', () => {
    const { data, fields } = buildPostValidationPayload('poll', {
      content: 'q?',
      pollOptions: ['a', '', 'b'],
    });
    expect(fields).toContain('pollOptions');
    expect(data.pollOptions).toBe('a\nb');
  });

  it('link post includes link fields', () => {
    const { fields } = buildPostValidationPayload('link', {
      content: 'c',
      linkUrl: 'https://x',
    });
    expect(fields).toEqual(['content', 'linkUrl', 'linkTitle', 'linkDescription']);
  });

  it('image post includes only content', () => {
    const { fields } = buildPostValidationPayload('image', { content: 'c' });
    expect(fields).toEqual(['content']);
  });
});

describe('preSubmitCheck', () => {
  it('rejects empty content', () => {
    expect(preSubmitCheck('text', { content: '   ' })?.field).toBe('content');
  });

  it('rejects poll with <2 options', () => {
    expect(preSubmitCheck('poll', { content: 'q', pollOptions: ['only'] })?.field).toBe(
      'pollOptions',
    );
  });

  it('accepts valid poll', () => {
    expect(preSubmitCheck('poll', { content: 'q', pollOptions: ['a', 'b'] })).toBeNull();
  });

  it('rejects non-http(s) url', () => {
    expect(
      preSubmitCheck('link', { content: 'c', linkUrl: 'javascript:alert(1)' })?.field,
    ).toBe('linkUrl');
  });

  it('rejects invalid url', () => {
    expect(preSubmitCheck('link', { content: 'c', linkUrl: 'not a url' })?.field).toBe(
      'linkUrl',
    );
  });

  it('accepts text post with content', () => {
    expect(preSubmitCheck('text', { content: 'hi' })).toBeNull();
  });
});
