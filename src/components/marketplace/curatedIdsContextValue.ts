import { createContext } from 'react';

export interface CuratedIdsApi {
  ids: Set<string>;
  register: (key: string, ids: string[]) => void;
}

export const CuratedIdsContext = createContext<CuratedIdsApi | null>(null);
