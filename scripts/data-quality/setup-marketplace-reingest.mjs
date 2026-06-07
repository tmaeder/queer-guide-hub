#!/usr/bin/env node
// Wire a one-off marketplace re-ingest of ohmyfantasy.com's fresh catalog through
// the existing marketplace pipeline (normalize → validate → LGBTQ+ relevance →
// dedup → quality → review-gate → commit → image-mirror + embeddings).
//
// ohmyfantasy wiped + re-slugged its Shopify store (audit 2026-06-07); the old
// listings 404 and were demoted by refresh-marketplace-images.mjs. This brings the
// current catalog back in as fresh listings (new slugs, working cdn.shopify.com
// images), gated by the same relevance/quality/review machinery as every source.
//
// Registers: pipeline_node_types(source-shopify-public) + pipeline_definitions
// (marketplace-reingest) + workflow_definitions(marketplace-reingest, unscheduled).
//
// Usage:
//   node scripts/data-quality/setup-marketplace-reingest.mjs [max_pages]   # default 2 (~500)
// Then trigger the run (executor accepts X-Internal-Secret from vault):
//   select net.http_post(
//     url := 'https://<ref>.supabase.co/functions/v1/pipeline-executor',
//     headers := jsonb_build_object('Authorization','Bearer <anon>',
//       'X-Internal-Secret',(select decrypted_secret from vault.decrypted_secrets where name='internal_invoke_secret')),
//     body := '{"action":"start","pipeline_name":"marketplace-reingest","triggered_by":"manual"}'::jsonb);
// For the full catalog (~7300 products) re-run this with a high max_pages (e.g. 40),
// then trigger again. The source paginates ohmyfantasy.com/products.json (250/page).

import { execFileSync } from 'node:child_process'
const PROJECT='xqeacpakadqfxjxjcewc'
function token(){ if(process.env.SUPABASE_PAT) return process.env.SUPABASE_PAT
  const raw=execFileSync('security',['find-generic-password','-s','Supabase CLI','-w'],{encoding:'utf8'}).trim()
  return Buffer.from(raw.replace(/^go-keyring-base64:/,''),'base64').toString('utf8') }
const TOKEN=token()
async function sql(query){
  const res=await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`,{method:'POST',
    headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json','User-Agent':'Mozilla/5.0'},
    body:JSON.stringify({query})})
  if(!res.ok) throw new Error(`mgmt ${res.status}: ${(await res.text()).slice(0,400)}`)
  return res.json() }
const J = (o) => `'${JSON.stringify(o).replace(/'/g,"''")}'::jsonb`

const MAX_PAGES = Number(process.argv[2] || 2) // small validation batch by default

const nodes = [
  { id:'src-ohmyfantasy', type:'source-shopify-public', position:{x:50,y:200},
    data:{ label:'OhMyFantasy (public)', config:{ shop_domain:'ohmyfantasy.com', source_slug:'ohmyfantasy', max_pages:MAX_PAGES, batch_size:250 } } },
  { id:'fan-in',    type:'fan-in',                 position:{x:290,y:200}, data:{label:'Fan In', config:{}} },
  { id:'normalize', type:'normalizer',             position:{x:490,y:200}, data:{label:'Normalize', config:{}} },
  { id:'validate',  type:'validator',              position:{x:690,y:200}, data:{label:'Validate', config:{entityType:'marketplace'}} },
  { id:'relevance', type:'marketplace-relevance',  position:{x:890,y:200}, data:{label:'LGBTQ+ Relevance', config:{threshold:0.5}} },
  { id:'dedup',     type:'deduplicator',           position:{x:1090,y:200}, data:{label:'Deduplicate', config:{review_min:0.80, auto_merge_min:0.95}} },
  { id:'quality',   type:'quality-scorer',         position:{x:1290,y:200}, data:{label:'Quality Score', config:{}} },
  { id:'review',    type:'review-gate',            position:{x:1490,y:200}, data:{label:'Review Gate', config:{min_quality:50, min_relevance:0.5}} },
  { id:'commit',    type:'committer',              position:{x:1690,y:200}, data:{label:'Commit', config:{targetTable:'marketplace_listings'}} },
  { id:'mirror',    type:'marketplace-image-mirror', position:{x:1890,y:140}, data:{label:'Image Mirror', config:{limit:25}} },
  { id:'embed',     type:'embedding-generator',    position:{x:1890,y:260}, data:{label:'Embeddings', config:{targetTable:'marketplace_listings'}} },
]
const edges = [
  {id:'e-src', source:'src-ohmyfantasy', target:'fan-in'},
  {id:'e-fan', source:'fan-in', target:'normalize'},
  {id:'e-norm', source:'normalize', target:'validate'},
  {id:'e-val', source:'validate', target:'relevance'},
  {id:'e-rel', source:'relevance', target:'dedup'},
  {id:'e-dedup', source:'dedup', target:'quality'},
  {id:'e-qual', source:'quality', target:'review'},
  {id:'e-rev', source:'review', target:'commit'},
  {id:'e-mirror', source:'commit', target:'mirror'},
  {id:'e-embed', source:'commit', target:'embed'},
]

await sql(`insert into pipeline_node_types (slug, category, display_name, description, edge_function, config_schema, input_ports, output_ports, is_enabled)
  values ('source-shopify-public','source','Shopify (public feed)','Ingest any Shopify storefront via its public /products.json (no Admin token)','source-shopify-public','{}'::jsonb,'[]'::jsonb,'[]'::jsonb,true)
  on conflict (slug) do update set edge_function=excluded.edge_function, description=excluded.description, updated_at=now()`)
console.log('✓ node type registered')

await sql(`insert into pipeline_definitions (name, display_name, description, nodes, edges, default_context, max_concurrency, timeout_seconds, is_enabled)
  values ('marketplace-reingest','Marketplace Re-ingest (OhMyFantasy)','One-off re-ingest of ohmyfantasy.com fresh catalog via public Shopify feed',
   ${J(nodes)}, ${J(edges)}, '{}'::jsonb, 1, 600, true)
  on conflict (name) do update set nodes=excluded.nodes, edges=excluded.edges, updated_at=now()`)
console.log(`✓ pipeline_definitions marketplace-reingest (max_pages=${MAX_PAGES})`)

await sql(`insert into workflow_definitions (name, display_name, description, edge_function, queue_name, default_payload, max_retries, max_concurrency, timeout_seconds, is_enabled, priority, tags)
  values ('marketplace-reingest','Marketplace Re-ingest','One-off ohmyfantasy fresh-catalog re-ingest','pipeline-executor','scheduled_jobs',
   '{"action":"start","triggered_by":"manual","pipeline_name":"marketplace-reingest"}'::jsonb, 2, 1, 600, true, 3, '{"marketplace","ingestion","reingest"}')
  on conflict (name) do update set default_payload=excluded.default_payload, is_enabled=true, updated_at=now()`)
console.log('✓ workflow_definitions marketplace-reingest')
