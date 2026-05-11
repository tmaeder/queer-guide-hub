// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CityRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CountryRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VenueRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VillageRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ArticleRelation = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NearestAirportType = any;

export function formatPopulation(pop: number) {
  if (pop >= 1e6) return `${(pop / 1e6).toFixed(1)}M people`;
  if (pop >= 1e3) return `${(pop / 1e3).toFixed(0)}K people`;
  return `${pop} people`;
}
