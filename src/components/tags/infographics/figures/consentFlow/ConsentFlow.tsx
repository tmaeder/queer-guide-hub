import { useTranslation } from 'react-i18next';
import { FlowGraph } from '../../primitives/FlowGraph';
import type { InfographicViewProps } from '../../types';
import { EDGES, NODES, PAD, VIEW } from './data';

export default function ConsentFlow(props: InfographicViewProps) {
  const { t } = useTranslation();
  return (
    <FlowGraph
      {...props}
      nodes={NODES}
      edges={EDGES}
      viewBox={VIEW}
      padX={PAD.x}
      padY={PAD.y}
      // A ladder graph — one spine with terminals hanging off it — needs
      // stable columns, or the lanes holding only the spine would centre it.
      alignColumns
      track="pink"
      groupLabel={t('tags.figures.consentFlow.groupLabel', 'Stops on the line')}
      hintLabel={t(
        'tags.figures.consentFlow.hint',
        'Select any stop to light up the route that reaches it.',
      )}
    />
  );
}
