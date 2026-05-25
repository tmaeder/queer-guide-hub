// Section definitions for the editorial QueerVillageDetail. IDs match the legacy
// tab ids 1:1 so EditorialDetailLayout's ?tab=→?section= redirect stays clean.

export interface VillageSectionDef {
  id: 'overview' | 'venues' | 'events' | 'photos' | 'map';
  label: string;
}

export const VILLAGE_SECTION_DEFS: VillageSectionDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'venues', label: 'Venues' },
  { id: 'events', label: 'Events' },
  { id: 'photos', label: 'Photos' },
  { id: 'map', label: 'Map' },
];
