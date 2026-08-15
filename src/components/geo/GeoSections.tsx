/**
 * The geo singles' section vocabulary moved to `@/components/transit` when the
 * venue and event singles became its fourth and fifth consumers — it was never
 * geographic, only geo-first. Re-exported under the old names so the three geo
 * pages did not have to change in the same commit.
 */
export {
  SingleSectionList as GeoSectionList,
  SingleRouteRail as GeoRouteRail,
} from '@/components/transit/SingleSections';
