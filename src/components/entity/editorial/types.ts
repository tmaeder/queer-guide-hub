import type { ReactNode } from 'react';

export interface SectionDef {
  id: string;
  label: ReactNode;
  kicker?: string;
  /** Optional one-line deck under the heading. */
  description?: ReactNode;
  /** Optional header-right slot, e.g. a "see all" link. */
  action?: ReactNode;
  content: ReactNode;
}
