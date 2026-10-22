/** Types for vbz-reliability.mjs (TS7016). */
export declare const LATE_FROM_S: number;
export declare const ON_TIME_EARLY_S: number;
export declare const ON_TIME_LATE_S: number;
export declare function createReliabilityAccumulator(): {
  add(row: Record<string, string>): void;
  result(
    minSamples?: number,
  ): { route_ref: string; day_class: string; on_time_share: number; samples: number }[];
};
