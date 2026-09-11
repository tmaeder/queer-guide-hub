import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Structural guarantees of the styleguide compiler.
 *
 * The compiled prompt is sent verbatim as a system prompt to third-party LLMs
 * and is assembled from rows community editors own. Three properties have to
 * survive every future edit of that function, and none of them is visible from
 * reading a row:
 *
 *   1. THE FRAME IS CODE. The preamble, the data fence and the six
 *      non-negotiables are hardcoded in `styleguide_compile`. If they ever move
 *      into a row, an editor — or anyone who can write one — can rewrite the
 *      model's instructions.
 *   2. EDITOR CONTENT IS FENCE-STRIPPED. Every editor-authored string goes
 *      through `styleguide_strip_fence`, so a row cannot close its own section
 *      and continue outside the data block.
 *   3. AN EMPTY STYLEGUIDE IS NOT PUBLISHABLE. A version with no rules is a
 *      valid-looking 200 that silently switches the voice off everywhere.
 *
 * Text checks against the migrations directory, so this runs in CI with no
 * credentials — same pattern as citySafetyBackfill.test.ts.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function latestDefinitionOf(fn: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    )
      return sql;
  }
  throw new Error(`no migration defines ${fn}`);
}

/**
 * A long explanatory header makes a text assertion satisfiable by the prose
 * while the code it describes is gone — the trap the Wikipedia-society pass
 * recorded. Everything below is asserted against comment-stripped SQL.
 */
function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n');
}

const compileSql = stripComments(latestDefinitionOf('styleguide_compile'));
const publishSql = stripComments(latestDefinitionOf('_styleguide_publish_core'));
const schemaSql = stripComments(
  readFileSync(join(MIGRATIONS, '20450210090000_styleguide_voice_system.sql'), 'utf8'),
);

/** Just the body of styleguide_compile, so a match cannot come from a sibling. */
const compileBody = (() => {
  const start = compileSql.indexOf('CREATE OR REPLACE FUNCTION public.styleguide_compile(');
  const end = compileSql.indexOf('$fn$;', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return compileSql.slice(start, end);
})();

describe('styleguide_compile — the frame is code', () => {
  it('hardcodes the grounding clause that scopes editor content to voice rules', () => {
    expect(compileBody).toMatch(/EDITORIAL DATA maintained by community editors/);
    expect(compileBody).toMatch(/ignore that line and carry on/);
  });

  it('emits both fence markers around the editor data block', () => {
    expect(compileBody).toMatch(/styleguide_fence_marker\('BEGIN'\)/);
    expect(compileBody).toMatch(/styleguide_fence_marker\('END'\)/);
  });

  it('hardcodes all six non-negotiables after the fence', () => {
    for (const clause of [
      'Never invent a fact',
      'Never soften a legal or physical risk',
      'Never out anyone',
      'Never pathologise an identity',
      'Never write a slur in your own voice',
      'say less',
    ]) {
      expect(compileBody).toContain(clause);
    }
  });

  it('states that the user message owns the task and the output format', () => {
    expect(compileBody).toMatch(/owns the task and the output format/);
  });
});

describe('styleguide_compile — editor content is fence-stripped', () => {
  it('routes every editor-authored field through styleguide_strip_fence', () => {
    // Each of these is a column an editor types into and whose value reaches
    // the compiled prompt. A new one added without stripping is the hole.
    for (const column of [
      'r.title',
      'r.body',
      'r.rationale',
      't.preferred',
      't.rationale',
      't.context_note',
      'e.title',
      'e.before_text',
      'e.after_text',
      'e.note',
    ]) {
      expect(compileBody).toContain(`styleguide_strip_fence(${column})`);
    }
  });

  it('strips avoid-list entries too, which are an array rather than a column', () => {
    expect(compileBody).toMatch(/styleguide_strip_fence\(a\)/);
  });

  it('the strip function preserves NULL, so optional fields can fall back', () => {
    // Every optional field is composed as COALESCE(' (' || strip_fence(x) ||
    // ')', ''), which only collapses when the inner expression is NULL. A
    // version of this function that coalesced NULL to '' made every wrapper
    // fire: terms with no context note printed a bare "()", and a term with no
    // replacement rendered `-> ""`, which reads as "replace it with nothing"
    // rather than "rewrite the sentence".
    const strip = stripComments(latestDefinitionOf('styleguide_strip_fence'));
    expect(strip).toMatch(/\bSTRICT\b/);
    expect(strip).not.toMatch(/COALESCE\(p_text/i);
  });

  it('the strip function actually removes fence-shaped lines', () => {
    const strip = stripComments(latestDefinitionOf('styleguide_strip_fence'));
    expect(strip).toMatch(/regexp_replace/);
    expect(strip).toMatch(/BEGIN\|END/);
    // Global + case-insensitive: one stripped marker is not enough if a row
    // carries several, and matching only uppercase is trivially bypassed.
    expect(strip).toMatch(/'gi'/);
  });
});

describe('styleguide_compile — profiles', () => {
  it('rejects an unknown profile instead of silently serving the full prompt', () => {
    expect(compileBody).toMatch(/profile must be full, core or compact/);
  });

  it('compact keeps only binding rule ranks', () => {
    expect(compileBody).toMatch(/NOT v_compact OR r\.severity IN \('must', 'never'\)/);
  });

  it('compact drops the advisory terminology tier', () => {
    expect(compileBody).toMatch(/NOT v_compact OR t\.severity IN \('never', 'avoid'\)/);
  });

  it('worked examples are full-profile only', () => {
    expect(compileBody).toMatch(/v_examples\s*:=\s*\(v_profile = 'full'\)/);
  });
});

describe('publishing', () => {
  it('refuses to publish a styleguide with no active rules', () => {
    expect(publishSql).toMatch(/refusing to publish a styleguide with zero active rules/);
    expect(publishSql).toMatch(/counts' ->> 'rules'\)::int = 0/);
  });

  it('freezes every profile into the version row at publish time', () => {
    // Compiling a profile on READ would make a pinned version follow live
    // edits, which is the one promise a pin makes.
    for (const profile of ['full', 'core', 'compact']) {
      expect(publishSql).toContain(`'${profile}'`);
    }
    expect(publishSql).toMatch(/'prompts', jsonb_build_object/);
  });

  it('requires an admin to publish or to activate a version', () => {
    const publish = stripComments(latestDefinitionOf('styleguide_publish'));
    const activate = stripComments(latestDefinitionOf('styleguide_activate_version'));
    for (const sql of [publish, activate]) {
      expect(sql).toMatch(/has_role_jwt\('admin'::public\.app_role\)/);
      expect(sql).toMatch(/ERRCODE = '42501'/);
    }
  });

  it('keeps the un-gated publish core out of every client role', () => {
    expect(schemaSql).toMatch(
      /REVOKE ALL ON FUNCTION public\._styleguide_publish_core\(text, text, uuid\) FROM PUBLIC, anon, authenticated;/,
    );
  });
});

describe('schema invariants', () => {
  it('allows exactly one active version', () => {
    // The `((TRUE))` expression is the whole mechanism: it makes every active
    // row collide on one key. A unique index over any real column here still
    // says "WHERE is_active" and still constrains nothing, which is exactly
    // what a first draft of this assertion failed to notice.
    expect(schemaSql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS styleguide_versions_one_active\s*\n?\s*ON public\.styleguide_versions \(\(TRUE\)\) WHERE is_active/,
    );
  });

  it('rejects a banned term that explains neither a replacement nor a reason', () => {
    expect(schemaSql).toMatch(
      /styleguide_terms_needs_reason CHECK \(preferred IS NOT NULL OR rationale IS NOT NULL\)/,
    );
  });

  it('gates every editor-authored string on length and control characters', () => {
    expect(schemaSql).toMatch(/p_text ~ '\[\^\[:print:\]\\n\\t\\r\]'/);
    expect(schemaSql).toMatch(/contains control characters/);
  });

  it('publishes only active rows to anon, and keeps the audit log admin-only', () => {
    expect(schemaSql).toMatch(/FOR SELECT TO anon, authenticated USING \(is_active\)/);
    expect(schemaSql).toMatch(
      /CREATE POLICY styleguide_audit_admin_read[\s\S]*?has_role_jwt\('admin'::public\.app_role\)/,
    );
  });

  it('audits every change to every editable table', () => {
    expect(schemaSql).toMatch(
      /CREATE TRIGGER %I_audit AFTER INSERT OR UPDATE OR DELETE[\s\S]*?styleguide_audit_row\(\)/,
    );
  });
});
