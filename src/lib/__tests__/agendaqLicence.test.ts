import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * agendaq.fr licence boundary.
 *
 * Mirrors gaysCruisingLicence.test.ts. Two separate things are asserted and
 * they must not be conflated:
 *
 * 1. PROSE. Blue Savanah is a société de presse; `descShort`, `desc` and event
 *    `description` are its copy. The importer reads none of them unless a
 *    second, explicit acknowledgement is set.
 * 2. CONSENT. agendaq's /fr/legals contains no conditions of use at all, which
 *    is NOT a grant — the French database producer's right (CPI L342-1) covers
 *    extracting a substantial part regardless of copyright in any single fact,
 *    and this pulls the whole guide and agenda. Until Blue Savanah's permission
 *    is recorded, every writing phase must refuse to run.
 *
 * These assertions are deliberately about the REPO, not about the consent
 * document's prose: a doc can be edited to say anything, whereas a script that
 * exits is a fact.
 */

const ROOT = join(import.meta.dirname ?? __dirname, '../../..');
const SCRIPT = join(ROOT, 'scripts/data-quality/import-agendaq.ts');
const PARSE = join(ROOT, 'supabase/functions/_shared/agendaq-parse.ts');
const CONSENT = join(ROOT, 'docs/licences/agendaq-consent.md');

const script = () => readFileSync(SCRIPT, 'utf8');
const parse = () => readFileSync(PARSE, 'utf8');

/** Strip comments so a guard cannot be satisfied by prose that merely describes it. */
function statements(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

describe('agendaq licence boundary', () => {
  it('the consent record exists and names the gate variable', () => {
    expect(existsSync(CONSENT), 'docs/licences/agendaq-consent.md missing').toBe(true);
    const doc = readFileSync(CONSENT, 'utf8');
    expect(doc).toMatch(/AGENDAQ_CONSENT_REF/);
    // The rightsholder has to be named, or the record documents nothing.
    expect(doc).toMatch(/Blue Savanah/);
    // And the right actually being relied on, not just "copyright".
    expect(doc).toMatch(/L342-1/);
  });

  it('every writing phase is gated on AGENDAQ_CONSENT_REF', () => {
    const s = statements(script());
    // The gate must be invoked by each phase that hits their servers or writes.
    for (const phase of ['fetch', 'stage', 'drain', 'orgs', 'schedule']) {
      expect(s, `--phase ${phase} does not call requireConsent`).toMatch(
        new RegExp(`requireConsent\\(\\s*'${phase}'\\s*\\)`),
      );
    }
    // ...and the gate must actually exit, not warn.
    expect(s).toMatch(/AGENDAQ_CONSENT_REF/);
    expect(s).toMatch(/process\.exit\(1\)/);
  });

  it('refuses to run a writing phase with no consent ref, and exits non-zero', () => {
    // The behavioural check. A structural assertion alone passes against a
    // gate that is present but unreachable.
    for (const phase of ['stage', 'drain', 'orgs', 'schedule']) {
      let code = 0;
      try {
        execFileSync('node', [SCRIPT, '--phase', phase], {
          cwd: ROOT,
          stdio: 'pipe',
          env: { ...process.env, AGENDAQ_CONSENT_REF: '', AGENDAQ_PROSE_ACK: '' },
        });
      } catch (e) {
        code = (e as { status?: number }).status ?? 0;
      }
      expect(code, `--phase ${phase} did not exit 1 without consent`).toBe(1);
    }
  });

  it('prose needs a second acknowledgement beyond consent', () => {
    const s = statements(script());
    expect(s).toMatch(/AGENDAQ_PROSE_ACK/);
    // The ack is compared to a fixed sentence, not merely truthy-checked.
    expect(s).toMatch(/i-accept-republishing-agendaq-editorial-prose/);
    // Behavioural. BOTH cases are required and the second is the one that bites:
    // an empty ack is rejected even by a sloppy truthy check, so asserting only
    // that case passes against `Boolean(env.AGENDAQ_PROSE_ACK)` — under which
    // any non-empty value unlocks the prose. Found by mutation testing; the
    // empty-string case alone let that mutant survive.
    const runProse = (ack: string) => {
      try {
        execFileSync('node', [SCRIPT, '--phase', 'report', '--include-prose'], {
          cwd: ROOT,
          stdio: 'pipe',
          env: { ...process.env, AGENDAQ_CONSENT_REF: 'x', AGENDAQ_PROSE_ACK: ack },
        });
        return 0;
      } catch (e) {
        return (e as { status?: number }).status ?? 0;
      }
    };
    expect(runProse(''), '--include-prose ran with an empty ack').toBe(1);
    expect(runProse('yes'), '--include-prose ran with a WRONG non-empty ack').toBe(1);
    expect(
      runProse('i-accept-republishing-agendaq-editorial-prose-x'),
      'a near-miss ack was accepted',
    ).toBe(1);
  });

  it('no prose field is read unconditionally', () => {
    const s = statements(script());
    // Every read of a prose field must sit behind INCLUDE_PROSE. Checked by
    // requiring the guard on the same line as the field access.
    for (const field of ['descShort', 'description']) {
      const lines = s.split('\n').filter((l) => l.includes(field) && !l.includes('target_terms'));
      for (const l of lines) {
        if (!/INCLUDE_PROSE/.test(l)) {
          // allow the type-only mentions and the metadata key name
          expect(
            /^\s*(\*|\/\/)/.test(l) || /agendaq_recurrence|metadata|detail:/.test(l),
            `unguarded prose read: ${l.trim()}`,
          ).toBe(true);
        }
      }
    }
  });

  it('the parse module declares prose fields but never defaults them in', () => {
    const p = parse();
    // The feed HAS prose; the type may describe it (otherwise a caller cannot
    // know it exists to refuse it). What matters is that no mapping function
    // copies it.
    expect(p).toMatch(/descShort/);
    const body = statements(p);
    // No payload builder lives in the parse module, so no assignment of a prose
    // field may appear in it at all.
    expect(body).not.toMatch(/description\s*:\s*[a-zA-Z]/);
    expect(body).not.toMatch(/descShort\s*:\s*[a-zA-Z]/);
  });

  it('images are referenced, never mirrored', () => {
    const s = statements(script());
    // No R2/storage upload path. Mirroring their assets is a separate licence
    // question from referencing a URL.
    expect(s).not.toMatch(/marketplace-images|storage\s*\.\s*from|r2|putObject/i);
    expect(statements(parse())).toMatch(/data\.agendaq\.fr/);
  });

  /**
   * Generous timeout on purpose, and NOT because the assertion is vague: this
   * repo lives in an iCloud-synced folder, so scanning the ~1,600 migration
   * files materialises each one and costs 8-20s however it is done (plain grep,
   * git grep and a -F fixed-string scan were all measured within noise of each
   * other). The default 15s made this flake, and a licence gate that people
   * learn to re-run is worse than no gate. Shelling out directly rather than
   * through `bash -lc` keeps stdout free of any login-profile output.
   */
  it('nothing registers this source as a cron, automation or ingestion source', () => {
    // A script is a deliberate, attended act. A cron would re-extract on a
    // schedule, which no consent record currently covers.
    let out = '';
    try {
      out = execFileSync(
        'grep',
        ['-rlF', '--include=*.sql', 'agendaq', join(ROOT, 'supabase/migrations')],
        { encoding: 'utf8' },
      ).trim();
    } catch (e) {
      // grep exits 1 on no match, which is the state we want. Any other
      // status is a broken probe and must not read as a clean result.
      const status = (e as { status?: number }).status;
      if (status !== 1) {
        throw new Error(`grep probe failed with status ${status}`, { cause: e });
      }
    }
    expect(out, `a migration references agendaq:\n${out}`).toBe('');
  }, 60_000);

  it('the corpus cache is gitignored', () => {
    // out-agendaq/ holds ~64 MB of Blue Savanah's database. Committing it would
    // itself be republishing it.
    // `git check-ignore` exits 1 when the path is NOT ignored, which is the
    // failure we are looking for — so a throw means "not ignored", not a
    // broken probe.
    const ignored = (() => {
      try {
        return execFileSync('git', ['check-ignore', 'out-agendaq/pages/x.json'], {
          cwd: ROOT,
          encoding: 'utf8',
        }).trim();
      } catch {
        return '';
      }
    })();
    expect(ignored, 'out-agendaq/ is not gitignored').not.toBe('');
  });
});
