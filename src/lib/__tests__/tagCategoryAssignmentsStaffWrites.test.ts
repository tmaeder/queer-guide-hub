/**
 * Guard for 99991792777512_tag_category_assignments_staff_writes.sql.
 *
 * Until that migration any signed-in member could INSERT/UPDATE/DELETE
 * `tag_category_assignments` over PostgREST, and the AFTER trigger
 * `unified_tags_recompute_is_adult` re-derives `unified_tags.is_adult` from
 * those rows — so a member could drop any tag's 18+ age gate or re-file any
 * glossary page. The migration's own `do $verify$` block proves the gate
 * behaviourally at apply time; this file stops a LATER migration or a new
 * client write path from quietly reopening it.
 *
 * Assertions run over comment-stripped SQL: the migration header quotes the
 * old policy names and predicate verbatim, so an unstripped search would pass
 * against a file whose statements had been deleted.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../../..');
const MIG_DIR = join(ROOT, 'supabase/migrations');
const MIGRATION = '99991792777512_tag_category_assignments_staff_writes.sql';

const stripComments = (sql: string) =>
  sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');

const code = stripComments(readFileSync(join(MIG_DIR, MIGRATION), 'utf8'));
const statements = code.slice(0, code.indexOf('do $verify$'));
const verify = code.slice(code.indexOf('do $verify$'));

const policyStatements = (sql: string) =>
  [...sql.matchAll(/create policy[\s\S]*?;/gi)]
    .map((m) => m[0])
    .filter((s) => /on\s+public\.tag_category_assignments\b/i.test(s));

describe('tag_category_assignments writes are staff-only', () => {
  it('drops all three member-writable policies', () => {
    for (const verb of ['delete', 'insert', 'update']) {
      expect(statements).toContain(
        `drop policy if exists "Authenticated users can ${verb} tag category assignments" on public.tag_category_assignments;`,
      );
    }
  });

  it('creates exactly one role-gated policy per write verb, for authenticated only', () => {
    const created = policyStatements(statements);
    expect(created).toHaveLength(3);
    for (const verb of ['insert', 'update', 'delete']) {
      const p = created.find((s) => new RegExp(`for\\s+${verb}\\b`, 'i').test(s));
      expect(p, `${verb} policy`).toBeDefined();
      expect(p).toMatch(/to\s+authenticated\b/i);
      expect(p).toContain("api_private.has_any_role_jwt(array['admin', 'moderator']::app_role[])");
      // Editors and plain members are not in the set.
      expect(p).not.toMatch(/'editor'/);
      expect(p).not.toMatch(/auth\.uid\(\)\)\s+is\s+not\s+null/i);
    }
    const update = created.find((s) => /for\s+update\b/i.test(s))!;
    expect(update).toMatch(/using\s*\(/i);
    expect(update).toMatch(/with check\s*\(/i);
  });

  it('revokes the anon write grants and keeps reads', () => {
    expect(statements).toMatch(
      /revoke\s+insert,\s*update,\s*delete\s+on\s+public\.tag_category_assignments\s+from\s+anon;/i,
    );
    expect(statements).not.toMatch(/revoke[^;]*select[^;]*tag_category_assignments/i);
  });

  it('verify block impersonates a plain member AND an admin, and raises on failure', () => {
    // Member probe: no user_role claim.
    expect(verify).toMatch(
      /json_build_object\('sub', gen_random_uuid\(\), 'role', 'authenticated'\)::text/,
    );
    // Admin positive control.
    expect(verify).toMatch(/'user_role', 'admin'/);
    expect(verify.match(/execute 'set local role authenticated';/g)).toHaveLength(2);
    // Each failure branch must RAISE, not merely test.
    for (const tag of ['P1 failed', 'P1b failed', 'P2 failed', 'P3 failed', 'P4 failed']) {
      expect(verify).toMatch(new RegExp(`raise exception '${tag}`));
    }
    expect(verify).toMatch(/if v_n <> 0 then\s+raise exception 'P2 failed: plain member UPDATE/);
    expect(verify).toMatch(/if v_n <> 0 then\s+raise exception 'P2 failed: plain member DELETE/);
    expect(verify).toMatch(/if v_n <> 1 then\s+raise exception 'P3 failed/);
    // Probes swallow only their own sentinel; anything else is re-raised.
    expect(verify).toMatch(/if v_state not like 'p2_probe_done:%' then\s+raise;/);
    expect(verify).toMatch(/if v_state <> 'p3_probe_done' then\s+raise;/);
  });

  it('no later migration reintroduces a member-writable policy on the table', () => {
    const later = readdirSync(MIG_DIR)
      .filter((f) => f.endsWith('.sql') && f > MIGRATION)
      .sort();
    for (const f of later) {
      const sql = stripComments(readFileSync(join(MIG_DIR, f), 'utf8'));
      for (const p of policyStatements(sql)) {
        if (/for\s+select\b/i.test(p)) continue;
        expect(p, `${f} adds a write policy without a role helper`).toMatch(/has_(any_)?role/);
      }
    }
  });

  it('no client code under src/ writes the table', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p);
        } else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) {
          const src = readFileSync(p, 'utf8');
          const re = /from\(\s*['"]tag_category_assignments['"]\s*\)([\s\S]{0,200})/g;
          for (const m of src.matchAll(re)) {
            if (/^\s*\.(insert|update|upsert|delete)\s*\(/.test(m[1])) offenders.push(p);
          }
        }
      }
    };
    walk(join(ROOT, 'src'));
    expect(offenders).toEqual([]);
  });
});
