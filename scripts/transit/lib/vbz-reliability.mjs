/**
 * Late-evening punctuality from VBZ "Fahrzeiten SOLL-IST" (Stadt Zürich OGD, CC0).
 *
 * Measured on the 2023 files before writing this: the night network (N-lines) is
 * NOT in the dataset — every line has zero departures 01:00-03:59 outside New
 * Year's Eve — so this rates the LAST REGULAR departures, not night buses.
 * Cancelled trips are absent from the files, so this is punctuality of trips that
 * ran, never "did it run". Both limits are stated wherever the number is shown.
 */

export const LATE_FROM_S = 23 * 3600;
/** Leaving early strands people; a little late does not. */
export const ON_TIME_EARLY_S = 60;
export const ON_TIME_LATE_S = 180;

const DAY_CLASS = {
  1: 'weekday',
  2: 'weekday',
  3: 'weekday',
  4: 'weekday',
  5: 'friday',
  6: 'saturday',
  0: 'sunday',
};

/** 'dd.mm.yy' -> UTC ms */
function parseDmy(s) {
  const [d, m, y] = s.split('.').map(Number);
  return Date.UTC(2000 + y, m - 1, d);
}

export function createReliabilityAccumulator() {
  const acc = new Map(); // `${linie}|${day_class}` -> {n, ok}
  return {
    /** One CSV row object (column names as in the VBZ files). */
    add(r) {
      const soll = Number(r.soll_ab_von);
      const ist = Number(r.ist_ab_von);
      if (!Number.isFinite(soll) || !Number.isFinite(ist) || !r.betriebsdatum || !r.datum_von)
        return;
      const service = parseDmy(r.betriebsdatum);
      const t = soll + Math.round((parseDmy(r.datum_von) - service) / 1000);
      if (t < LATE_FROM_S) return;
      const cls = DAY_CLASS[new Date(service).getUTCDay()];
      const key = `${String(r.linie).trim()}|${cls}`;
      let s = acc.get(key);
      if (!s) acc.set(key, (s = { n: 0, ok: 0 }));
      s.n++;
      const delay = ist - soll;
      if (delay >= -ON_TIME_EARLY_S && delay <= ON_TIME_LATE_S) s.ok++;
    },
    /** Lines with fewer than minSamples late departures are omitted, not guessed. */
    result(minSamples = 200) {
      return [...acc.entries()]
        .filter(([, s]) => s.n >= minSamples)
        .map(([key, s]) => {
          const [route_ref, day_class] = key.split('|');
          return {
            route_ref,
            day_class,
            on_time_share: Math.round((s.ok / s.n) * 1000) / 1000,
            samples: s.n,
          };
        });
    },
  };
}
