import { useContext } from 'react';
import { CuratedIdsContext, type CuratedIdsApi } from './curatedIdsContextValue';

export function useCuratedIds(): CuratedIdsApi {
  return useContext(CuratedIdsContext) ?? { ids: new Set(), register: () => {} };
}
