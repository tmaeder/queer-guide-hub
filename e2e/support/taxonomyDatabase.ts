import { execFileSync } from 'node:child_process';
import { taxonomyFamilies } from './taxonomyCases';

const tables = new Set(taxonomyFamilies.map((family) => family.id));
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

export function assertLocalTaxonomyEnvironment(env = process.env) {
  const frontend = new URL(env.E2E_BASE_URL || 'https://queer.guide');
  const api = new URL(env.VITE_SUPABASE_URL || 'https://missing-backend.invalid');
  const database = new URL(env.E2E_TAXONOMY_DB_URL || 'postgresql://missing-database.invalid/db');
  for (const [kind, url] of [
    ['frontend', frontend],
    ['API', api],
    ['database', database],
  ] as const) {
    if (!localHosts.has(url.hostname) || url.search || url.hash)
      throw new Error(`Taxonomy mutations require a loopback ${kind} URL without URL options`);
  }
  if (
    !['http:', 'https:'].includes(frontend.protocol) ||
    !['http:', 'https:'].includes(api.protocol) ||
    !['postgres:', 'postgresql:'].includes(database.protocol)
  )
    throw new Error('Unsupported taxonomy test URL protocol');
  if (!env.VITE_SUPABASE_ANON_KEY || !env.E2E_ADMIN_EMAIL || !env.E2E_ADMIN_PASSWORD)
    throw new Error('Taxonomy tests require explicit local API and admin credentials');
  return { frontend, api, database };
}

export const sqlLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

export class TaxonomyDatabase {
  private readonly database: URL;

  constructor(env = process.env) {
    this.database = assertLocalTaxonomyEnvironment(env).database;
  }

  sql(statement: string): string {
    const db = this.database;
    return execFileSync(
      process.env.E2E_PSQL_BIN || 'psql',
      ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
      {
        input: statement,
        encoding: 'utf8',
        timeout: 30_000,
        env: {
          ...process.env,
          PGHOST: db.hostname.replace(/^\[|\]$/g, ''),
          PGHOSTADDR:
            db.hostname === 'localhost' ? '127.0.0.1' : db.hostname.replace(/^\[|\]$/g, ''),
          PGPORT: db.port || '5432',
          PGDATABASE: decodeURIComponent(db.pathname.slice(1)),
          PGUSER: decodeURIComponent(db.username),
          PGPASSWORD: decodeURIComponent(db.password),
          PGCONNECT_TIMEOUT: '5',
        },
      },
    ).trim();
  }

  json<T>(statement: string): T {
    return JSON.parse(this.sql(statement)) as T;
  }

  rows(table: string, prefix: string): Record<string, unknown>[] {
    if (!tables.has(table as (typeof taxonomyFamilies)[number]['id']))
      throw new Error('Not a taxonomy fixture table');
    const title = table.startsWith('kink_') ? 'label' : 'name';
    // starts_with avoids LIKE treating a fixture identifier as a pattern.
    return this.json(`select coalesce(jsonb_agg(t),'[]'::jsonb) from public.${table} t
      where starts_with(lower(${title}),lower(${sqlLiteral(prefix)}));`);
  }

  cleanup(table: string, prefix: string) {
    if (!/^Taxonomy Regression [0-9]{20,40}$/.test(prefix))
      throw new Error('Refusing cleanup without an owned fixture prefix');
    const rows = this.rows(table, prefix);
    const title = table.startsWith('kink_') ? 'label' : 'name';
    // This helper is available only to the dedicated loopback configuration.
    // The exclusive lock prevents any concurrent writer seeing the guard off;
    // a failure rolls back the entire DO statement, including trigger state.
    this.sql(`do $cleanup$ declare owned uuid[]; guard_state "char"; begin
      perform set_config('lock_timeout','5s',true);
      lock table public.${table} in access exclusive mode;
      select array_agg(id) into owned from public.${table}
        where starts_with(lower(${title}),lower(${sqlLiteral(prefix)}));
      if owned is null then return; end if;
      select tgenabled into guard_state from pg_trigger
        where tgrelid='public.${table}'::regclass and tgname='guard_managed_taxonomy';
      if guard_state is not null and guard_state<>'O' then
        raise exception 'Unexpected taxonomy guard state';
      end if;
      if guard_state='O' then
        alter table public.${table} disable trigger guard_managed_taxonomy;
      end if;
      ${table === 'unified_tags' ? 'delete from public.tag_aliases where canonical_tag_id=any(owned);' : ''}
      delete from public.${table} where id=any(owned);
      delete from public.cms_content_metadata
        where source_table=${sqlLiteral(table)} and source_id::text=any(owned::text[]);
      if guard_state='O' then
        alter table public.${table} enable trigger guard_managed_taxonomy;
      end if;
    end $cleanup$;`);
    const remaining = this.rows(table, prefix).length;
    const ids = rows.map((row) => sqlLiteral(String(row.id))).join(',');
    const metadataRemaining = ids
      ? Number(
          this.sql(`select count(*) from public.cms_content_metadata
      where source_table=${sqlLiteral(table)} and source_id::text in (${ids});`),
        )
      : 0;
    const guardRestored =
      this.sql(`select not exists(select 1 from pg_trigger
      where tgrelid='public.${table}'::regclass and tgname='guard_managed_taxonomy' and tgenabled<>'O');`) ===
      't';
    if (remaining || metadataRemaining || !guardRestored)
      throw new Error(`Fixture cleanup failed for ${table}`);
    return { table, removed: rows.length, remaining, metadataRemaining, guardRestored };
  }

  enableIntimateAdmin(email: string): () => void {
    const id = this.sql(`select id from auth.users where email=${sqlLiteral(email)};`);
    if (!/^[\da-f-]{36}$/.test(id)) throw new Error('Local synthetic admin is missing');
    const before = this.json<Record<
      string,
      unknown
    > | null>(`select coalesce((select jsonb_build_object(
      'opted_in_at',opted_in_at,'consent_18plus_at',consent_18plus_at,'moderation_status',moderation_status)
      from public.intimate_profiles where id=${sqlLiteral(id)}),'null'::jsonb);`);
    this
      .sql(`insert into public.intimate_profiles(id,opted_in_at,consent_18plus_at,moderation_status)
      values (${sqlLiteral(id)},now(),now(),'approved') on conflict(id) do update
      set opted_in_at=excluded.opted_in_at,consent_18plus_at=excluded.consent_18plus_at,moderation_status='approved';`);
    return () => {
      if (!before) this.sql(`delete from public.intimate_profiles where id=${sqlLiteral(id)};`);
      else
        this.sql(`update public.intimate_profiles set
        opted_in_at=${before.opted_in_at === null ? 'null' : sqlLiteral(String(before.opted_in_at))},
        consent_18plus_at=${before.consent_18plus_at === null ? 'null' : sqlLiteral(String(before.consent_18plus_at))},
        moderation_status=${sqlLiteral(String(before.moderation_status))} where id=${sqlLiteral(id)};`);
    };
  }
}
