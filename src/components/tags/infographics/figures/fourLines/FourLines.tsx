import { useTranslation } from 'react-i18next';
import { LineStrip } from '../../primitives/LineStrip';
import { InfographicTermChip } from '../../InfographicTermChip';
import type { InfographicViewProps } from '../../types';
import { LINES } from './data';

/**
 * Thin binding: the editorial decisions live in data.ts, the layout and a11y
 * in LineStrip. Lazy-loaded, so none of this reaches the eager chunk.
 */
export default function FourLines(props: InfographicViewProps) {
  const { t } = useTranslation();
  return (
    <LineStrip
      {...props}
      lines={LINES}
      readoutTitleKey="tags.figures.fourLines.readout"
      readoutTitleFallback="Your four lines"
      readoutNoteKey="tags.figures.fourLines.independent"
      readoutNoteFallback="Four separate answers. None of them follows from another."
      renderTermChip={(slug) => (
        <InfographicTermChip
          slug={slug}
          terms={props.terms}
          currentSlug={props.currentSlug}
          label={t('tags.figures.readMore', 'Read the entry')}
        />
      )}
    />
  );
}
