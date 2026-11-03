import { describe, it, expect } from 'vitest';
import { fourLinesMeta } from '../figures/fourLines/meta';
import { consentFlowMeta } from '../figures/consentFlow/meta';
import { LINES } from '../figures/fourLines/data';
import { STATIONS, STOPS } from '../figures/consentFlow/data';

/**
 * The drift guard.
 *
 * `dataTable()` is the accessible equivalent of the drawing, and it is a
 * SEPARATE function from the one that draws — which means it can silently fall
 * behind. Add a line to a diagram, forget the table, and the figure still
 * renders perfectly while the fallback quietly describes a different picture.
 * Nobody notices, because the people who would notice are the ones reading the
 * fallback.
 *
 * So each table is tied to the count of things actually drawn, from the same
 * data module. Adding a line or a stop without touching the table fails here.
 */

describe('data table drift', () => {
  it('Four Lines: one row per line on the map', () => {
    const table = fourLinesMeta.dataTable();
    expect(table.rows).toHaveLength(LINES.length);
    // Row order is map order, so reading the table is reading the diagram.
    table.rows.forEach((row, i) => {
      expect(row[0]).toBe(LINES[i].labelFallback);
    });
  });

  it('Four Lines: every stop appears in its line row', () => {
    const table = fourLinesMeta.dataTable();
    LINES.forEach((line, i) => {
      for (const stop of line.stops) {
        expect(table.rows[i][2]).toContain(stop.labelFallback);
      }
    });
  });

  it('Four Lines: the table says how each line is picked', () => {
    // Pick-one vs pick-any IS the correction on identity and attraction; a
    // table that dropped it would describe the slider we rebuilt away from.
    const table = fourLinesMeta.dataTable();
    LINES.forEach((line, i) => {
      expect(table.rows[i][1]).toBe(line.select === 'one' ? 'Pick one' : 'Pick any that fit');
    });
  });

  it('The Line That Stops: one row per stop, in reading order', () => {
    const table = consentFlowMeta.dataTable();
    expect(table.rows).toHaveLength(STOPS.length);
    table.rows.forEach((row, i) => {
      expect(row[0]).toBe(STOPS[i].labelFallback);
    });
  });

  it('The Line That Stops: every off-ramp end says it is the end of the line', () => {
    const table = consentFlowMeta.dataTable();
    for (const station of STATIONS) {
      if (!station.branch) continue;
      const i = STOPS.findIndex((s) => s.id === station.branch!.to.id);
      expect(table.rows[i][3]).toBe('End of the line');
    }
  });

  it('The Line That Stops: "clear to proceed" is NOT an end of the line', () => {
    // The figure's whole thesis. Every circulating version of this chart
    // terminates in approval, which teaches that consent is a gate you pass
    // once. Ours loops back to the check-in — and the accessible table has to
    // carry that too, or a reader using it gets the version we rejected.
    const table = consentFlowMeta.dataTable();
    const i = STOPS.findIndex((n) => n.id === 'go');
    expect(table.rows[i][3]).not.toBe('End of the line');
    expect(table.rows[i][3]).toContain('Still yes, right now?');
  });

  it('every note authored on a stop survives into the table', () => {
    // The notes carry the reasons. A table listing labels alone would drop
    // exactly the content that makes the diagram worth reading.
    const table = consentFlowMeta.dataTable();
    STOPS.forEach((n, i) => {
      if (!n.noteFallback) return;
      expect(table.rows[i][2]).toBe(n.noteFallback);
    });
  });

  it('no table cell is empty where the drawing shows something', () => {
    for (const meta of [fourLinesMeta, consentFlowMeta]) {
      for (const row of meta.dataTable().rows) {
        expect(row[0].trim().length).toBeGreaterThan(0);
      }
    }
  });
});
