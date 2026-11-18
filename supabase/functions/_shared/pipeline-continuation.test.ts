import { strict as assert } from 'node:assert'
import { continuationResult, resumableTimeout } from './pipeline-continuation.ts'
Deno.test('unfinished pages require an advancing, bounded checkpoint', () => {
  assert.deepEqual(continuationResult({success:true,items:0,has_more:true,cursor:{offset:4}},{offset:0}),{items:0,more:true,cursor:{offset:4}})
  assert.throws(()=>continuationResult({has_more:true,cursor:{offset:4}},{offset:4}),/did not advance/)
  assert.throws(()=>continuationResult({has_more:true,cursor:[]},null),/object/)
  assert.throws(()=>continuationResult({success:false,error:'429'},null),/429/)
  assert.throws(()=>continuationResult({items_failed:1},null),/failure/)
  assert.throws(()=>continuationResult({items:-1},null),/item count/)
  assert.deepEqual(continuationResult({items:0,has_more:false},{}),{items:0,more:false,cursor:null})
})
Deno.test('whole-run timeout cannot turn a page request into an unbounded call',()=>{
  assert.equal(resumableTimeout({}),90000)
  assert.equal(resumableTimeout({timeout_seconds:86400}),120000)
  assert.equal(resumableTimeout({timeout_seconds:'invalid'}),90000)
})
