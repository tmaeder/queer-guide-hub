import { describe, it, expect } from 'vitest';
import { SERVICE_COLORS, formatClaudePrompt, formatErrorClaudePrompt, formatStoryClusterPrompt } from '../claudePrompts';

describe('claudePrompts', () => {
  it('SERVICE_COLORS is an object', () => {
    expect(typeof SERVICE_COLORS).toBe('object');
  });
  it('formatClaudePrompt returns string', () => {
    const out = formatClaudePrompt({ id: 'f1', title: 'X', description: '', kind: 'bug', data: { context: {} } } as never);
    expect(typeof out).toBe('string');
  });
  it('formatErrorClaudePrompt returns string', () => {
    const out = formatErrorClaudePrompt({ id: 'e1', occurrence_count: 1, data: { function_name: 'fn', message: 'm', service: 's' } } as never);
    expect(typeof out).toBe('string');
  });
  it('formatStoryClusterPrompt returns string', () => {
    expect(typeof formatStoryClusterPrompt(['a', 'b'])).toBe('string');
  });
});
