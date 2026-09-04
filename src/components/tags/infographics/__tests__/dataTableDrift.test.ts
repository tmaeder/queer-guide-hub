import { describe, it, expect } from 'vitest';
import { fourLinesMeta } from '../figures/fourLines/meta';
import { consentFlowMeta } from '../figures/consentFlow/meta';
import { AXES } from '../figures/fourLines/data';
import { NODES, EDGES } from '../figures/consentFlow/data';

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
    expect(table.rows).toHaveLength(AXES.length);
    // Row order is map order, so reading the table is reading the diagram.
    table.rows.forEach((row, i) => {
      expect(row[0]).toBe(AXES[i].labelFallback);
    });
  });

  it('Four Lines: every stop appears in its line row', () => {
    const table = fourLinesMeta.dataTable();
    AXES.forEach((axis, i) => {
      for (const station of axis.stations) {
        expect(table.rows[i][1]).toContain(station.labelFallback);
      }
    });
  });

  it('Four Lines: the terminus reads as an ending, not a destination', () => {
    const table = fourLinesMeta.dataTable();
    const i = AXES.findIndex((a) => a.terminus);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(table.rows[i][2]).not.toContain('interchange');
  });

  it('The Line That Stops: one row per stop', () => {
    const table = consentFlowMeta.dataTable();
    expect(table.rows).toHaveLength(NODES.length);
    table.rows.forEach((row, i) => {
      expect(row[0]).toBe(NODES[i].labelFallback);
    });
  });

  it('The Line That Stops: a stop with nowhere to go says so, rather than leaving a blank', () => {
    const table = consentFlowMeta.dataTable();
    NODES.forEach((n, i) => {
      if (n.kind !== 'outcome') return;
      const hasOnward = EDGES.some((e) => e.from === n.id);
      if (hasOnward) return;
      expect(table.rows[i][3]).toBe('End of the line');
    });
  });

  it('The Line That Stops: "clear to proceed" is NOT an end of the line', () => {
    // The figure's whole thesis. Every circulating version of this chart
    // terminates in approval, which teaches that consent is a gate you pass
    // once. Ours loops back to the check-in — and the accessible table has to
    // carry that too, or a reader using it gets the version we rejected.
    const table = consentFlowMeta.dataTable();
    const i = NODES.findIndex((n) => n.id === 'go');
    expect(table.rows[i][3]).not.toBe('End of the line');
    expect(table.rows[i][3]).toContain('Still yes, right now?');
  });

  it('every note authored on a node survives into the table', () => {
    // The notes carry the reasons. A table listing labels alone would drop
    // exactly the content that makes the diagram worth reading.
    const table = consentFlowMeta.dataTable();
    NODES.forEach((n, i) => {
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
