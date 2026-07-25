import type { TFunction } from 'i18next';

export const LANDMARK_KINDS = [
  'park',
  'beach',
  'monument',
  'memorial',
  'building',
  'viewpoint',
  'landmark',
  'other',
] as const;

export type LandmarkKind = (typeof LANDMARK_KINDS)[number];

export function landmarkKindLabel(kind: string, t: TFunction): string {
  switch (kind) {
    case 'park':
      return t('geo.landmarkKind.park', 'Park');
    case 'beach':
      return t('geo.landmarkKind.beach', 'Beach');
    case 'monument':
      return t('geo.landmarkKind.monument', 'Monument');
    case 'memorial':
      return t('geo.landmarkKind.memorial', 'Memorial');
    case 'building':
      return t('geo.landmarkKind.building', 'Building');
    case 'viewpoint':
      return t('geo.landmarkKind.viewpoint', 'Viewpoint');
    case 'landmark':
      return t('geo.landmarkKind.landmark', 'Landmark');
    default:
      return t('geo.landmarkKind.other', 'Place');
  }
}
