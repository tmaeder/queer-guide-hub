import { useTranslation } from 'react-i18next';
import { AxisSet } from '../../primitives/AxisSet';
import { InfographicTermChip } from '../../InfographicTermChip';
import type { InfographicViewProps } from '../../types';
import { AXES, JUNCTION, VIEW } from './data';

/**
 * The renderer is a thin binding: all the editorial decisions are in data.ts,
 * all the geometry and a11y in AxisSet. Lazy-loaded, so none of this reaches
 * the eager chunk.
 */
export default function FourLines(props: InfographicViewProps) {
  const { t } = useTranslation();
  return (
    <AxisSet
      {...props}
      axes={AXES}
      viewBox={VIEW}
      junction={JUNCTION}
      readoutTitleKey="tags.figures.fourLines.readout"
      readoutTitleFallback="Where you are on each line"
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
