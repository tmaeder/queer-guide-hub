/** Types for gtfs-night.mjs so src/lib/__tests__/transitGtfsNight.test.ts can import it (TS7016). */
export declare const NIGHT_CUTOFF_S: number;
export declare function parseCsvLine(line: string): string[];
export declare function gtfsTimeToSeconds(s: string | undefined | null): number | null;
export declare function formatServiceSeconds(s: number): string;
export declare function mapMode(
  routeType: string | number,
  routeDesc?: string,
): { mode: 'tram' | 'metro' | 'rail' | 'bus' | 'ferry'; night: boolean } | null;
export declare function pickServiceWeek(
  today: string,
  feedStart: string,
  feedEnd: string,
): string[] | null;
export declare function weekdayOf(yyyymmdd: string): number;
export declare function activeServices(
  dates: string[],
  calendarRows: Record<string, string>[],
  exceptions: { service_id: string; date: string; exception_type: string }[],
): Map<string, Set<string>>;
export interface NightRow {
  routeKey: string;
  day_class: 'weekday' | 'friday' | 'saturday' | 'sunday';
  first_departure_s: number;
  last_departure_s: number;
  runs_all_night: boolean;
  trip_count: number;
}
export declare function createNightAccumulator(week: string[]): {
  add(date: string, routeKey: string, t: number, tripId: string): void;
  result(): NightRow[];
};
export declare const SERVICE_GAP_S: number;
export declare function serviceEnd(
  times: number[],
  nightLine?: boolean,
): { last: number; allNight: boolean };
export declare function separateNightVariants<
  T extends {
    city_id: string;
    mode: string;
    route_ref: string;
    day_class: string;
    is_night_line: boolean;
  },
>(rows: T[]): T[];
export declare function isLongDistanceRail(
  routeType: string | number,
  routeDesc?: string,
  ref?: string,
): boolean;
