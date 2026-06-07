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
const J=(o)=>`'${JSON.stringify(o).replace(/'/g,"''")}'::jsonb`

const [{nodes,edges}] = await sql(`select nodes, edges from pipeline_definitions where name='marketplace-ingestion'`)
const node = { id:'src-ohmyfantasy', type:'source-shopify-public', position:{x:50,y:440},
  data:{ label:'OhMyFantasy (public)', config:{ shop_domain:'ohmyfantasy.com', source_slug:'ohmyfantasy', max_pages:40, batch_size:250 } } }
const edge = { id:'e-omf', source:'src-ohmyfantasy', target:'fan-in', animated:true }

const newNodes = [...nodes.filter(n=>n.id!=='src-ohmyfantasy'), node]
const newEdges = [...edges.filter(e=>e.id!=='e-omf'), edge]

await sql(`update pipeline_definitions set nodes=${J(newNodes)}, edges=${J(newEdges)}, updated_at=now() where name='marketplace-ingestion'`)
console.log(`✓ marketplace-ingestion now has ${newNodes.length} nodes (sources: ${newNodes.filter(n=>n.id.startsWith('src')).map(n=>n.id).join(', ')})`)
