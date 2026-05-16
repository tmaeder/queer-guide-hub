/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
  getFileType, formatFileSize, getFileIcon,
  getOptimizationStatusBadge, getOptimizationIcon,
  getImageUrl, getThumbnailUrl, entityTypeLabel, entityAdminPath,
} from '../utils';

describe('MediaLibrary/utils', () => {
  it('getFileType', () => {
    expect(getFileType('x.png')).toBeDefined();
  });
  it('formatFileSize', () => {
    expect(formatFileSize(0)).toBeDefined();
    expect(formatFileSize(1024)).toBeDefined();
    expect(formatFileSize(null)).toBeDefined();
  });
  it('getFileIcon returns a node', () => {
    expect(getFileIcon('image/png')).toBeDefined();
  });
  it('getOptimization helpers', () => {
    expect(getOptimizationStatusBadge('pending' as never)).toBeDefined();
    expect(getOptimizationIcon('pending' as never)).toBeDefined();
  });
  it('getImageUrl / getThumbnailUrl', () => {
    expect(typeof getImageUrl({ public_url: 'x' } as never)).toBe('string');
    expect(typeof getThumbnailUrl({ public_url: 'x' } as never)).toBe('string');
  });
  it('entityTypeLabel and entityAdminPath', () => {
    expect(typeof entityTypeLabel('venue')).toBe('string');
    expect(typeof entityAdminPath('venue', 'v1')).toBe('string');
  });
});
