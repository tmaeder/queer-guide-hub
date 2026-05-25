import type { ReactNode } from 'react';

export interface SectionDef {
  id: string;
  label: ReactNode;
  kicker?: string;
  content: ReactNode;
}
