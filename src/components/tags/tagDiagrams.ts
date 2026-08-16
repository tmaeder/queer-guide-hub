/**
 * Diagram bands that mount on specific glossary pages.
 *
 * A registry rather than slug-checks inside TagDetail: the page renders
 * whatever is listed for the tag's slug, adds a route-strip station per
 * diagram (i18n key `tags.diagrams.<id>`), and stays untouched when a new
 * diagram is added here.
 */

import type { ComponentType } from 'react';
import { ChemsexWheel } from './ChemsexWheel';
import { PharmacosexMap } from './PharmacosexMap';

export interface TagDiagram {
  /** Unique on the page — used as the section anchor and station id. */
  id: string;
  /** English fallback for the station label. */
  title: string;
  Component: ComponentType;
}

export const TAG_DIAGRAMS: Record<string, TagDiagram[]> = {
  chemsex: [
    { id: 'chemsex-wheel', title: 'The chemsex wheel', Component: ChemsexWheel },
    { id: 'pharmacosex', title: 'Why people mix', Component: PharmacosexMap },
  ],
};
