import{afterEach,describe,it,expect}from'vitest';
import{mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,unlinkSync}from'node:fs';
import{tmpdir}from'node:os';
import{join}from'node:path';
import{writeShardManifest,verifyShardInputs,verifyMergedUnitResults}from'../../scripts/ci/unit-shard-reports.mjs';
const directories:string[]=[];
const sha='a'.repeat(40);
function fixture(){const root=mkdtempSync(join(tmpdir(),'unit-shard-gate-'));directories.push(root);mkdirSync(join(root,'blobs'));for(let i=1;i<=2;i++){writeFileSync(join(root,'blobs',`blob-${i}.json`),`native result ${i}`);writeShardManifest(root,`${i}/2`,sha);}return root;}
afterEach(()=>{for(const path of directories.splice(0))rmSync(path,{recursive:true,force:true});});
describe('required shard evidence',()=>{
 it('admits only a complete matching set',()=>expect(verifyShardInputs(fixture(),2,sha).shards).toBe(2));
 it('refuses a missing blob',()=>{const root=fixture();unlinkSync(join(root,'blobs','blob-2.json'));expect(()=>verifyShardInputs(root,2,sha)).toThrow(/Incomplete/);});
 it('refuses an extra or duplicated report',()=>{const root=fixture();writeFileSync(join(root,'blobs','blob-extra.json'),'duplicate');expect(()=>verifyShardInputs(root,2,sha)).toThrow(/unexpected/);});
 it('refuses evidence from another commit',()=>expect(()=>verifyShardInputs(fixture(),2,'b'.repeat(40))).toThrow(/Wrong commit/));
 it('refuses substituted content',()=>{const root=fixture();writeFileSync(join(root,'blobs','blob-2.json'),'substituted');expect(()=>verifyShardInputs(root,2,sha)).toThrow(/Damaged/);});
 it('refuses a repeated shard identity',()=>{const root=fixture(),path=join(root,'manifests','shard-2.json'),m=JSON.parse(readFileSync(path,'utf8'));m.shard_index=1;writeFileSync(path,JSON.stringify(m));expect(()=>verifyShardInputs(root,2,sha)).toThrow(/identity/);});
 it('refuses a mismatched Vitest version',()=>{const root=fixture(),path=join(root,'manifests','shard-2.json'),m=JSON.parse(readFileSync(path,'utf8'));m.vitest_version='unknown';writeFileSync(path,JSON.stringify(m));expect(()=>verifyShardInputs(root,2,sha)).toThrow(/version/);});
});
describe('complete merged discovery',()=>{
 const discovery=[{file:'/project/a.test.ts'},{file:'/project/b.test.ts'}];
 const good={success:true,numFailedTests:0,numFailedTestSuites:0,numTotalTests:4,testResults:[{name:'/project/a.test.ts',status:'passed'},{name:'/project/b.test.ts',status:'passed'}]};
 it('admits every discovered file once',()=>expect(verifyMergedUnitResults(discovery,good).files).toBe(2));
 it('refuses a partial successful run',()=>expect(()=>verifyMergedUnitResults(discovery,{...good,testResults:good.testResults.slice(0,1)})).toThrow(/every discovered/));
 it('refuses duplicated files even when another file is missing',()=>expect(()=>verifyMergedUnitResults(discovery,{...good,testResults:[good.testResults[0],good.testResults[0]]})).toThrow(/more than one/));
 it('refuses failures and unknown result shapes',()=>{expect(()=>verifyMergedUnitResults(discovery,{...good,success:false})).toThrow(/failures/);expect(()=>verifyMergedUnitResults(discovery,{...good,numFailedTests:1})).toThrow(/failures/);expect(()=>verifyMergedUnitResults([],good)).toThrow(/nonempty/);});
});
