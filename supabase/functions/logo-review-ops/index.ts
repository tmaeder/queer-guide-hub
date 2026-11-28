import { getServiceClient, requireInternalOrAdmin, jsonResponse, errorResponse, corsResponse } from '../_shared/supabase-client.ts'
import { callJev, createJevBudget, JEV_MODEL, readJevResponse } from '../_shared/jev-client.ts'
import { LOGO_REVIEW_ACCOUNT, logoReviewRequest, supportedLogoReview } from '../_shared/logo-review-questions.ts'
import { logoBytesHash, inspectLogoBytes, publicLogoUrl } from '../_shared/logo-quality.ts'
import { mirrorLogoToR2 } from '../_shared/logo-mirror.ts'
import { loadDeniedMarks, logoMarkSha256 } from '../_shared/platform-domain.ts'

const TYPES = ['venues','events','organizations','marketplace_brands']
Deno.serve(async req => {
  if (req.method==='OPTIONS') return corsResponse(req)
  const db=getServiceClient()
  const token=req.headers.get('x-logo-review-token') ?? ''
  let session=false
  if (token.length===64) {
    const hash=await logoBytesHash(new TextEncoder().encode(token))
    const checked=await db.rpc('logo_review_session_check',{p_hash:hash})
    session=!checked.error && checked.data===true
  }
  if (!session) { const auth=await requireInternalOrAdmin(req,db);if(auth instanceof Response)return auth }
  try {
    const body=await req.json()
    if(body.action==='jobs'){
      const r=await db.rpc('logo_review_source_jobs',{p_offset:Math.max(0,Math.trunc(Number(body.offset)||0)),p_limit:500})
      if(r.error)throw new Error(r.error.message)
      return jsonResponse({jobs:r.data},200,req)
    }
    if(body.action==='profiles'){
      if(!Array.isArray(body.targets)||body.targets.length>500)return errorResponse('invalid_context_targets',400,req)
      const r=await db.rpc('logo_review_business_context',{p_targets:body.targets})
      if(r.error)throw new Error(r.error.message)
      return jsonResponse({profiles:r.data},200,req)
    }
    if(body.action==='findings'){
      if(!Array.isArray(body.findings)||body.findings.length>500)return errorResponse('invalid_review_findings',400,req)
      const r=await db.rpc('logo_review_record_findings',{p_findings:body.findings})
      if(r.error)throw new Error(r.error.message)
      return jsonResponse({recorded:r.data},200,req)
    }
    if(body.action==='status'){
      const r=await db.rpc('get_jev_budget_status',{p_account:LOGO_REVIEW_ACCOUNT})
      if(r.error)throw new Error(r.error.message)
      return jsonResponse({budget:r.data},200,req)
    }
    if(body.action==='judge'){
      const state=body.state
      if(!state || JSON.stringify(state).length>12000) return errorResponse('invalid_public_evidence',400,req)
      const apiKey=Deno.env.get('TYPESAFE_API_KEY')||Deno.env.get('JEV_API_KEY')||''
      const budget=createJevBudget(db,LOGO_REVIEW_ACCOUNT)
      let answer
      if(body.image_base64){
        // Experimental images are test evidence only. They never authorize publication.
        if(typeof body.image_base64!=='string'||body.image_base64.length>400000)return errorResponse('invalid_test_image',400,req)
        const ref=crypto.randomUUID()
        const request=logoReviewRequest({...state,candidate_image:ref},ref)
        const payload={...request,assets:{[ref]:{type:'image',format:'png',data_base64:body.image_base64}}}
        const serialized=JSON.stringify(payload),requestId=crypto.randomUUID()
        const requestHash=await logoBytesHash(new TextEncoder().encode(serialized))
        if(!await budget.reserve({requestId,caller:'logo-review.image-test',requestHash}))return errorResponse('verification_budget_exhausted',429,req)
        let inputTokens:number|null=null
        try{
          const r=await fetch('https://api.typesafe.ai/v1/systemone',{method:'POST',redirect:'error',
            headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','TypeSafe-Danger-Zone-Images':'true'},
            body:serialized,signal:AbortSignal.timeout(20000)})
          if(!r.ok){await r.body?.cancel();throw new Error(`TypeSafe HTTP ${r.status}`)}
          answer=readJevResponse(await r.json(),request);inputTokens=answer.usage.input_tokens
        }finally{await budget.settle(requestId,inputTokens)}
      }else{
        answer=await callJev(logoReviewRequest(state),{apiKey,caller:'logo-review.official-source',budget})
      }
      return jsonResponse({answers:answer.answers,usage:answer.usage,model:JEV_MODEL,supported:supportedLogoReview(answer),experimental_image:!!body.image_base64},200,req)
    }
    if(body.action==='publish'){
      const a=body.approval
      if(!a || !TYPES.includes(a.entity_table)||typeof a.entity_id!=='string' || typeof a.png_base64!=='string'||a.png_base64.length>2800000 ||
        !a.evidence?.official_page || !publicLogoUrl(a.evidence.official_page) || !a.evidence?.source_url ||
        !['official_dom_and_visual_review','official_dom_and_ocr','official_dom_and_typed_review'].includes(a.evidence.method)) return errorResponse('invalid_reviewed_logo',400,req)
      const job=await db.from('logo_quality_jobs').select('*').eq('entity_table',a.entity_table).eq('entity_id',a.entity_id).single()
      if(job.error)throw new Error(job.error.message)
      if(!['review','quarantined'].includes(job.data.status))return jsonResponse({outcome:'already_processed'},200,req)
      if(job.data.entity_name!==a.entity_name || job.data.expected_url!==a.expected_url || job.data.expected_website!==a.expected_website)return jsonResponse({outcome:'stale_evidence'},200,req)
      const bytes=Uint8Array.from(atob(a.png_base64),c=>c.charCodeAt(0))
      const inspected=await inspectLogoBytes({bytes,contentType:'image/png'})
      if(!inspected.valid)return errorResponse(`invalid_reviewed_image_${inspected.reason}`,400,req)
      const denied=await loadDeniedMarks(db)
      if(denied.has(await logoBytesHash(bytes)))return errorResponse('denied_mark',400,req)
      const mirrored=await mirrorLogoToR2(bytes,'image/png')
      if(!mirrored)throw new Error('review_mirror_failed')
      if(denied.has(logoMarkSha256(mirrored)??''))return errorResponse('denied_mark',400,req)
      const lease=crypto.randomUUID()
      const claimed=await db.from('logo_quality_jobs').update({status:'processing',lease,updated_at:new Date().toISOString()})
        .eq('entity_table',a.entity_table).eq('entity_id',a.entity_id).eq('updated_at',job.data.updated_at)
        .in('status',['review','quarantined']).select('entity_id')
      if(claimed.error)throw new Error(claimed.error.message)
      if(!claimed.data?.length)return jsonResponse({outcome:'stale_review'},200,req)
      const saved=await db.rpc('logo_review_finish',{p_table:a.entity_table,p_id:a.entity_id,p_lease:lease,p_url:mirrored,
        p_reason:'verified_official_source_review',p_evidence:{...a.evidence,version:2,automatic:true,width:inspected.width,height:inspected.height,on_ink:false},p_on_ink:false})
      if(saved.error){
        await db.from('logo_quality_jobs').update({status:job.data.status,lease:null,updated_at:new Date().toISOString()})
          .eq('entity_table',a.entity_table).eq('entity_id',a.entity_id).eq('lease',lease)
        throw new Error(saved.error.message)
      }
      return jsonResponse({outcome:saved.data,url:mirrored},200,req)
    }
    return errorResponse('invalid_logo_review_action',400,req)
  }catch(e){
    console.error('Logo official-source review:',(e as Error).message)
    return errorResponse((e as Error).message.includes('budget')?'verification_budget_exhausted':'logo_review_failed',503,req)
  }
})
