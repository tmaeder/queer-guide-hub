/**
 * Pure half of scripts/check-npm-audit.mjs, split out so it is unit-testable
 * without a network call (src/lib/__tests__/npmAuditRatchet.test.ts).
 */

const GATED = new Set(['high', 'critical']);

/**
 * Advisories at high/critical in an `npm audit --json` report, keyed by GHSA
 * URL (stable across npm versions, unlike the numeric `source`). Only `via`
 * entries that are objects are advisories; string entries name a dependency
 * that is vulnerable through another package and would double-count.
 */
export function gatedAdvisories(report) {
  if (!report || typeof report !== 'object' || !report.vulnerabilities) {
    throw new Error('not an npm audit report (no `vulnerabilities` key)');
  }
  const out = new Map();
  for (const vuln of Object.values(report.vulnerabilities)) {
    for (const via of vuln.via ?? []) {
      if (typeof via !== 'object' || !GATED.has(via.severity)) continue;
      const id = via.url || `npm:${via.source}`;
      if (!out.has(id)) out.set(id, { id, package: via.name, severity: via.severity, title: via.title });
    }
  }
  return out;
}

/** `added` fails the gate; `resolved` fails too, so the baseline only shrinks. */
export function compareToBaseline(found, baseline) {
  const known = new Set(baseline.map((b) => b.id));
  return {
    added: [...found.values()].filter((a) => !known.has(a.id)),
    resolved: baseline.filter((b) => !found.has(b.id)),
  };
}
