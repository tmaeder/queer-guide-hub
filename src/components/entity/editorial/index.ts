export { EditorialDetailLayout } from './EditorialDetailLayout';
export type { EditorialBreadcrumb, EditorialDetailLayoutProps } from './EditorialDetailLayout';
export { EditorialSection } from './EditorialSection';
export { SectionNav } from './SectionNav';
export type { SectionNavItem, SectionNavProps } from './SectionNav';
// Lives in `@/components/transit` now — the geo singles need it outside this
// legacy layout family. Re-exported here so the five intent pages importing
// from this barrel do not have to move.
export { useActiveSection } from '@/components/transit/useActiveSection';
export { KeyFactsStrip } from './KeyFactsStrip';
export type { KeyFact, KeyFactsStripProps } from './KeyFactsStrip';
export type { SectionDef } from './types';
