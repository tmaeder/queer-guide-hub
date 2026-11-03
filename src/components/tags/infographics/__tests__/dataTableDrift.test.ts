import { describe, it, expect } from 'vitest';
import { fourLinesMeta } from '../figures/fourLines/meta';
import { consentFlowMeta } from '../figures/consentFlow/meta';
import { LINES } from '../figures/fourLines/data';
import { ENTRY, STATIONS, STOP } from '../figures/consentFlow/data';

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

  it('The Line That Stops: entry, one row per station in ring order, then Stop', () => {
    const table = consentFlowMeta.dataTable();
    expect(table.rows).toHaveLength(STATIONS.length + 2);
    expect(table.rows[0][0]).toBe(ENTRY.labelFallback);
    STATIONS.forEach((s, i) => expect(table.rows[i + 1][0]).toBe(s.labelFallback));
    expect(table.rows.at(-1)![0]).toBe(STOP.labelFallback);
  });

  it('The Line That Stops: every station leads to Stop for anything but a yes', () => {
    // Stop is one step from every station — the figure's spokes, in words.
    const table = consentFlowMeta.dataTable();
    STATIONS.forEach((s, i) => {
      expect(table.rows[i + 1][3]).toContain(STOP.labelFallback);
      expect(table.rows[i + 1][3]).toContain(s.whyFallback);
    });
  });

  it('The Line That Stops: "go, for now" is NOT an end of the line', () => {
    // The figure's whole thesis. Every circulating version of this chart
    // terminates in approval, which teaches that consent is a gate you pass
    // once. Ours runs on round to asking again — and the accessible table has
    // to carry that too, or a reader using it gets the version we rejected.
    const table = consentFlowMeta.dataTable();
    const i = STATIONS.findIndex((n) => n.id === 'go');
    expect(table.rows[i + 1][2]).toBe(STATIONS[0].labelFallback);
    expect(table.rows[i + 1][2]).not.toBe('End of the line');
  });

  it('every note authored on a station survives into the table', () => {
    const table = consentFlowMeta.dataTable();
    STATIONS.forEach((s, i) => expect(table.rows[i + 1][1]).toBe(s.noteFallback));
  });

  it('no table cell is empty where the drawing shows something', () => {
    for (const meta of [fourLinesMeta, consentFlowMeta]) {
      for (const row of meta.dataTable().rows) {
        expect(row[0].trim().length).toBeGreaterThan(0);
      }
    }
  });
});
