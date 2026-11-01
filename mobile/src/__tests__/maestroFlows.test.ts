/**
 * Maestro flows select by visible English text, so a copy change in en.json
 * silently breaks them — and nothing runs Maestro in CI. This test is the
 * drift guard: every string a flow taps or asserts must be a current en.json
 * value, a regex matching one, or named test data below.
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import en from '../i18n/en.json';

const FLOW_DIR = path.join(__dirname, '../../.maestro');
// Strings that come from production data or user input, not the catalog.
const DATA = new Set(['Mylord']);

function leaves(o: unknown, out: string[] = []): string[] {
  if (typeof o === 'string') out.push(o);
  else if (o && typeof o === 'object') Object.values(o).forEach((v) => leaves(v, out));
  return out;
}
const CATALOG = leaves(en);

const SELECTOR_KEYS = new Set(['tapOn', 'assertVisible', 'assertNotVisible']);

function selectors(steps: unknown[]): string[] {
  const out: string[] = [];
  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;
    for (const [k, v] of Object.entries(step as Record<string, unknown>)) {
      if (SELECTOR_KEYS.has(k)) {
        if (typeof v === 'string') out.push(v);
        else if (v && typeof v === 'object' && typeof (v as { text?: unknown }).text === 'string')
          out.push((v as { text: string }).text);
      }
      if (k === 'extendedWaitUntil' && v && typeof v === 'object') {
        const vis = (v as { visible?: unknown }).visible;
        if (typeof vis === 'string') out.push(vis);
      }
    }
  }
  return out;
}

function resolves(sel: string): boolean {
  if (DATA.has(sel) || CATALOG.includes(sel)) return true;
  if (!/[.*+?()[\]]/.test(sel)) return false;
  const re = new RegExp(`^${sel}$`);
  // A pattern must match a catalog template once its {{vars}} are filled…
  if (CATALOG.some((s) => re.test(s.replace(/\{\{\w+\}\}/g, 'X')))) return true;
  // …or be catalog copy followed by data the code appends ("Call " + number).
  const prefix = (sel.split(/[.*+?()[\]]/)[0] ?? '').trim();
  return prefix.length > 0 && CATALOG.includes(prefix);
}

const files = fs.readdirSync(FLOW_DIR).filter((f) => /^\d+-.*\.yaml$/.test(f));

describe('Maestro flows', () => {
  it('finds the flow files (an empty set would pass every check below)', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  const config = fs.readFileSync(path.join(__dirname, '../../app.config.ts'), 'utf8');
  const prodId = /bundleIdentifier: IS_DEV \? '[^']+' : '([^']+)'/.exec(config)?.[1];

  it.each(files)('%s targets the production app and selects only real copy', (file) => {
    const docs = yaml.loadAll(fs.readFileSync(path.join(FLOW_DIR, file), 'utf8')) as unknown[];
    const header = docs[0] as { appId: string };
    expect(header.appId).toBe(prodId);
    const sels = selectors(docs[1] as unknown[]);
    expect(sels.length).toBeGreaterThan(0);
    expect(sels.filter((s) => !resolves(s))).toEqual([]);
  });
});
