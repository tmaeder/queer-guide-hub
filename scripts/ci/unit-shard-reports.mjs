#!/usr/bin/env node
// Gate transport completeness before Vitest applies the unchanged coverage floor.
import{createHash}from'node:crypto'
import{createRequire}from'node:module'
import{readFileSync,writeFileSync,mkdirSync,readdirSync,lstatSync,renameSync}from'node:fs'
import{resolve,join}from'node:path'
import{pathToFileURL}from'node:url'
const require=createRequire(import.meta.url)
const version=()=>JSON.parse(readFileSync(require.resolve('vitest/package.json'),'utf8')).version
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const json=path=>JSON.parse(readFileSync(path,'utf8'))
function assert(value,message){if(!value)throw Error(message)}
function validSha(sha){assert(typeof sha==='string'&&/^[a-f0-9]{40}$/.test(sha),'A complete commit SHA is required')}
function countValue(n){n=Number(n);assert(Number.isSafeInteger(n)&&n>=1&&n<=16,'Expected 1–16 test shards');return n}
export function writeShardManifest(root,shard,sha){
 validSha(sha)
 const parts=String(shard).split('/');assert(parts.length===2,'Expected index/count')
 const total=countValue(parts[1]),index=Number(parts[0]);assert(Number.isSafeInteger(index)&&index>=1&&index<=total,'Invalid shard index')
 const blob=join(root,'blobs',`blob-${index}.json`)
 assert(lstatSync(blob).isFile(),'Shard blob must be a regular file')
 const bytes=readFileSync(blob);assert(bytes.length>0,'Shard blob is empty')
 const manifest={schema_version:1,commit_sha:sha,shard_index:index,shard_count:total,vitest_version:version(),blob_sha256:hash(bytes)}
 const directory=join(root,'manifests'),path=join(directory,`shard-${index}.json`)
 mkdirSync(directory,{recursive:true});writeFileSync(path+'.tmp',JSON.stringify(manifest));renameSync(path+'.tmp',path)
 return manifest
}
export function verifyShardInputs(root,total,sha){
 validSha(sha);total=countValue(total)
 for(const[directory,filename]of[['blobs',i=>`blob-${i}.json`],['manifests',i=>`shard-${i}.json`]]){
  const expected=Array.from({length:total},(_,i)=>filename(i+1)).sort(),actual=readdirSync(join(root,directory)).sort()
  assert(JSON.stringify(expected)===JSON.stringify(actual),`Incomplete or unexpected ${directory}: expected exactly ${total} shard files`)
 }
 for(let index=1;index<=total;index++){
  const path=join(root,'blobs',`blob-${index}.json`),manifest=json(join(root,'manifests',`shard-${index}.json`))
  assert(lstatSync(path).isFile(),'Shard blob must be a regular file')
  assert(manifest.schema_version===1&&manifest.commit_sha===sha,`Wrong commit or manifest schema for shard ${index}`)
  assert(manifest.shard_index===index&&manifest.shard_count===total,`Wrong shard identity for shard ${index}`)
  assert(manifest.vitest_version===version(),`Vitest version mismatch for shard ${index}`)
  const bytes=readFileSync(path)
  assert(bytes.length>0&&hash(bytes)===manifest.blob_sha256,`Damaged or substituted blob for shard ${index}`)
 }
 return{shards:total,commit_sha:sha}
}
export function verifyMergedUnitResults(discovery,results,cwd=process.cwd()){
 assert(Array.isArray(discovery)&&discovery.length>0,'Complete nonempty Vitest file discovery is required')
 const names=discovery.map(item=>typeof item==='string'?item:item?.file)
 assert(names.every(name=>typeof name==='string'&&name.length>0),'Unrecognized test discovery format')
 const expected=names.map(name=>resolve(cwd,name)).sort()
 assert(new Set(expected).size===expected.length,'Duplicate test discovery entries')
 assert(results?.success===true&&results.numFailedTests===0&&results.numFailedTestSuites===0,'Merged unit results contain failures or an unknown result')
 assert(Array.isArray(results.testResults),'Merged file results missing')
 const actual=results.testResults.map(file=>{
  assert(typeof file.name==='string'&&['passed','pending','skipped'].includes(file.status),'Failed or unrecognized test file result')
  return resolve(cwd,file.name)
 }).sort()
 assert(new Set(actual).size===actual.length,'A test file ran in more than one shard')
 assert(JSON.stringify(actual)===JSON.stringify(expected),'Merged results must contain every discovered test file exactly once')
 return{files:expected.length,tests:results.numTotalTests}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const[mode,...args]=process.argv.slice(2)
  if(mode==='write')console.log(JSON.stringify(writeShardManifest(...args)))
  else if(mode==='verify-inputs')console.log(JSON.stringify(verifyShardInputs(...args)))
  else if(mode==='verify-results')console.log(JSON.stringify(verifyMergedUnitResults(json(args[0]),json(args[1]))))
  else throw Error('Use write, verify-inputs or verify-results')
 }catch(error){console.error(error.message);process.exitCode=1}
}
