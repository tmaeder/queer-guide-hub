import { useTranslation } from 'react-i18next';
import { BranchLine } from '../../primitives/BranchLine';
import type { InfographicViewProps } from '../../types';
import { LOOP, STATIONS } from './data';

export default function ConsentFlow(props: InfographicViewProps) {
  const { t } = useTranslation();
  return (
    <BranchLine
      {...props}
      stations={STATIONS}
      loop={LOOP}
      track="pink"
      groupLabel={t('tags.figures.consentFlow.groupLabel', 'Stops on the line')}
      hintLabel={t(
        'tags.figures.consentFlow.hint',
        'Select any stop to light up the route that reaches it.',
      )}
      routeLabel={t('tags.figures.consentFlow.route', 'Route')}
      restrictionLabel={t('tags.figures.consentFlow.restriction', 'Speed restriction')}
    />
  );
}
