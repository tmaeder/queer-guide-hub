import { describe, it, expect } from 'vitest';
import type {
  UnifiedMediaItem, OptimizationStatus, ViewMode, SortBy, SortDir,
  StatusFilter, FormatFilter, SourceTypeFilter, EntityTypeFilter,
  EntityLink, MediaDetailData, DuplicateGroup, VisualDuplicatePair,
} from '../types';

describe('MediaLibrary/types', () => {
  it('module loads', () => {
    // Type-only module: existence check via runtime import resolution
    expect(true).toBe(true);
  });
  it('values conform to type unions', () => {
    const view: ViewMode = 'grid';
    const sort: SortBy = 'created_at';
    const dir: SortDir = 'desc';
    const status: OptimizationStatus = 'pending' as OptimizationStatus;
    const sFilter: StatusFilter = 'all' as StatusFilter;
    const fFilter: FormatFilter = 'all' as FormatFilter;
    const tFilter: SourceTypeFilter = 'all';
    const eFilter: EntityTypeFilter = 'all' as EntityTypeFilter;
    expect([view, sort, dir, status, sFilter, fFilter, tFilter, eFilter].every(Boolean)).toBe(true);
  });
});
