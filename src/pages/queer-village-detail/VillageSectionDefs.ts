// Section definitions for the editorial QueerVillageDetail. The five legacy ids
// match the legacy tab ids 1:1 so EditorialDetailLayout's ?tab=→?section=
// redirect stays clean. The new #personalities band inherits the parent city.

export type VillageSectionId =
  | 'overview'
  | 'venues'
  | 'events'
  | 'personalities'
  | 'photos'
  | 'map';

export interface VillageSectionDef {
  id: VillageSectionId;
  label: string;
}

export const VILLAGE_SECTION_DEFS: VillageSectionDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'venues', label: 'Venues' },
  { id: 'events', label: 'Events' },
  { id: 'personalities', label: 'Voices' },
  { id: 'photos', label: 'Photos' },
  { id: 'map', label: 'Map' },
];
