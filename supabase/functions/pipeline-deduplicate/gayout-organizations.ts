import postgres from 'npm:postgres@3.4.5'

// Same four candidate arms and scores as find_organization_duplicate_candidates.
// Materialize the input once and inline the immutable normalization expressions:
// calling the SET-search_path SQL wrappers per row scanned 110k organizations
// repeatedly and exceeded PostgREST's eight-second statement limit.
export const GAYOUT_ORGANIZATION_CANDIDATES_SQL = `
with p as materialized (
  select $1::text name, lower(btrim($2::text)) domain,
    regexp_replace(lower(extensions.unaccent(coalesce($1::text,''))), '[^a-z0-9]', '', 'g') dn,
    btrim(regexp_replace(lower(extensions.unaccent(coalesce($1::text,''))), '[^a-z0-9]+', ' ', 'g')) nn
), names as materialized (
  select id,
    regexp_replace(lower(extensions.unaccent(coalesce(name,''))), '[^a-z0-9]', '', 'g') dn,
    btrim(regexp_replace(lower(extensions.unaccent(coalesce(name,''))), '[^a-z0-9]+', ' ', 'g')) nn
  from public.organizations
), cand as (
  select o.id oid, 'name_domain_exact'::text mt, 1.00::numeric sc
  from public.organizations o cross join p
  where p.domain is not null and lower(o.website_domain)=p.domain and length(p.dn)>=3
    and regexp_replace(lower(extensions.unaccent(coalesce(o.name,''))), '[^a-z0-9]', '', 'g')=p.dn
  union all
  select o.id, 'domain_exact', 0.90::numeric
  from public.organizations o cross join p
  where p.domain is not null and lower(o.website_domain)=p.domain
  union all
  select o.id, 'name_exact', 0.85::numeric
  from names o cross join p where length(p.dn)>=4 and o.dn=p.dn
  union all
  select o.id, 'name_trigram', (extensions.similarity(o.nn,p.nn)*0.85)::numeric
  from names o cross join p
  where p.name is not null and length(btrim(p.name))>=4 and extensions.similarity(o.nn,p.nn)>=0.90
)
select oid organization_id, mt match_type, sc score, null::double precision distance_m
from (select distinct on(oid) oid,mt,sc from cand order by oid,sc desc) q
order by sc desc limit greatest(1,least(coalesce($3::integer,10),50))`

export async function findGayOutOrganizationCandidates(connectionString: string,
  args: Record<string, unknown>): Promise<Array<Record<string, unknown>>> {
  const client = postgres(connectionString, { max: 1, prepare: false, connect_timeout: 10,
    idle_timeout: 5, max_lifetime: 30, ssl: 'require' })
  try {
    return await client.begin(async transaction => {
      await transaction`set local role service_role`
      await transaction`set local statement_timeout = '25s'`
      await transaction`set local lock_timeout = '5s'`
      await transaction`set local idle_in_transaction_session_timeout = '10s'`
      return Array.from(await transaction.unsafe(GAYOUT_ORGANIZATION_CANDIDATES_SQL,
        [args.p_name == null ? null : String(args.p_name),
          args.p_website_domain == null ? null : String(args.p_website_domain),
          args.p_limit == null ? 10 : Number(args.p_limit)]))
    })
  } finally { await client.end({ timeout: 5 }) }
}
