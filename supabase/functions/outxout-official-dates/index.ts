import { getServiceClient, requireInternalOrAdmin, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { callJev, createJevBudget, type JevRequest } from '../_shared/jev-client.ts'
import { COHORT, type Target } from './cohort.ts'
import { candidates, choose, verified, cleanTitle, selectionRequest, verificationRequest, POLICY } from './policy.ts'
import { collect } from './sources.ts'
import { connect, snapshot, claim, cache, save, failure, finish, NAME, SLUG, CONTINUE, jsonValue, type RecordData } from './store.ts'
import { contractTest, runModelProbes } from './test-contract.ts'

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return corsResponse(req)
  if(req.method!=='POST')return errorResponse('Use POST',405,req)
  const client=getServiceClient(),auth=await requireInternalOrAdmin(req,client)
  if(auth instanceof Response)return auth
  const body=await req.json().catch(()=>null)
  if(!body||typeof body!=='object'||Array.isArray(body))return errorResponse('Invalid request body',400,req)
  if(body.mode&&!['weekly','resume','manual'].includes(body.mode))return errorResponse('Invalid mode',400,req)
  const db=connect(),started=Date.now()
  const send=async(data:Record<string,unknown>,status=200)=>{
    const tracked=req.headers.get('x-automation-run-id')
    if(tracked&&/^\d{1,15}$/.test(tracked)){
      await db`select public.admin_automation_finalize_run(automation_slug,${status>=400?'error':'success'},id,started_at,${Number(data.examined??0)},${Number(data.approved??0)},${db.json(jsonValue(data))},${status>=400?'official_date_worker_failed':null}) from public.admin_automation_runs where id=${tracked}::bigint and automation_slug in(${SLUG},${CONTINUE}) and status='running' and not coalesce(summary,'{}'::jsonb)?'pipeline_run_id'`
    }
    return jsonResponse(data,status,req)
  }
  const evaluate=(request:JevRequest,account='production')=>callJev(request,{apiKey:Deno.env.get('JEV_API_KEY')||Deno.env.get('TYPESAFE_API_KEY')||'',caller:'outxout-official-dates',budget:createJevBudget(client,account)})
  try{
    if(body.probe===true){const [r]=await db`select 1 ok`;return await send({success:r.ok===1,database_configured:true,model_configured:!!(Deno.env.get('JEV_API_KEY')||Deno.env.get('TYPESAFE_API_KEY')),policy:POLICY})}
    if(body.test_contract===true)return await send(await contractTest(db))
    if(body.model_probe===true)return await send(await runModelProbes(request=>evaluate(request,'validation-2026-10-29')))
    if(body.dry_run===true||body.context?.dry_run===true){
      const previews=[]
      for(const city of [...new Set(COHORT.map(t=>t.city))]){
        const target=COHORT.find(t=>t.city===city)!,source=await collect([...new Set(COHORT.filter(t=>t.city===city).flatMap(t=>[...t.urls]))])
        previews.push({city,readable:source.pages.length,errors:source.errors,date_candidates:candidates(source.pages,target.year),pages:source.pages.map(p=>({url:p.url,sha256:p.sha256,retrieved_at:p.retrieved_at,characters:p.text.length}))})
        if(Date.now()-started>70000)break
      }
      return await send({success:true,dry_run:true,previews,cities_checked:previews.length,cities_total:6})
    }
    const work=await claim(db,body.mode??'manual')
    if(!('token'in work)||!work.token)return await send({success:true,...work})
    const id=work.run_id!,token=work.token,ctx=work.context!
    if(ctx.retry_at&&Date.parse(ctx.retry_at)>Date.now())return await send(await finish(db,id,token))
    let count=0
    for(const target of COHORT as readonly Target[]){
      if(ctx.results[target.id])continue
      if(++count>3||Date.now()-started>65000)break
      try{
        const current=await snapshot(db,target.id)
        if(!current)throw Error('cohort_event_missing')
        if(current.event.enrichment_status?.date_confirmation?.state!=='needs_review'||current.event.review_status!=='pending'){
          await save(db,id,token,target.id,{state:'skipped',reason:'already_resolved_or_not_pending'});continue
        }
        if(cleanTitle(current.event.title)!==target.title||current.event.city_id!==target.city_id){await save(db,id,token,target.id,{state:'blocked',reason:'cohort_identity_or_city_changed'});continue}
        let source=ctx.source_cache[target.city] as Awaited<ReturnType<typeof collect>>|undefined
        if(!source?.pages.length||Date.now()-Date.parse(source.checked_at)>6*3600000){
          source=await collect([...new Set(COHORT.filter(t=>t.city===target.city).flatMap(t=>[...t.urls]))])
          if(source.pages.length){await cache(db,id,token,target.city,source);ctx.source_cache[target.city]=source}
        }
        if(!source.pages.length)throw Error('official_sources_unavailable')
        const dates=candidates(source.pages,target.year)
        let result:RecordData={state:'unconfirmed',reason:'no_explicit_2027_date_for_specific_event',checked_urls:source.pages.map(p=>p.url),source_errors:source.errors}
        let change
        if(dates.length){
          if(dates.length>24)result.reason='too_many_date_candidates_for_safe_decision'
          else{
            const request=selectionRequest(target,source.pages,dates),selection=await evaluate(request),selected=choose(selection,dates)
            result={...result,selection:jsonValue({request,response:selection}),reason:selected?'confirmation_not_sufficient':'no_high_confidence_specific_event_date'}
            if(selected){
              const request=verificationRequest(target,source.pages,selected),verification=await evaluate(request)
              result.verification=jsonValue({request,response:verification})
              if(verified(verification))change={fingerprint:current.fingerprint,candidate:selected,page:source.pages[selected.page]}
            }
          }
        }
        await save(db,id,token,target.id,result,change)
      }catch(e){
        const reason=e instanceof Error?e.message:'official_date_check_failed'
        console.error('Official-date worker:',reason)
        await failure(db,id,token,target.id,reason)
        break
      }
    }
    return await send(await finish(db,id,token))
  }catch(e){console.error(NAME,e instanceof Error?e.message:'worker_failed');return await send({success:false,error:'official_date_worker_failed'},503)}
  finally{await db.end({timeout:1})}
})
