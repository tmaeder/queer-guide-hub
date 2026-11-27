import { getServiceClient } from './supabase-client.ts'
import { loadDeniedMarks, loadPlatformRules, logoMarkSha256 } from './platform-domain.ts'
import { probeRealLogo } from './logo-enrichment.ts'
import { mirrorLogoToR2 } from './logo-mirror.ts'
import { canonicalLogoWebsite, fetchLogoResource, genericLogoAsset, inspectLogoBytes, LOGO_QUALITY_VERSION, resolveQualityLogo } from './logo-quality.ts'

interface LogoJob {
  entity_table: string; entity_id: string; entity_name: string
  expected_url: string | null; expected_website: string | null; lease: string
  evidence: Record<string, unknown>
}

export async function processQualityLogoJobs(
  db: ReturnType<typeof getServiceClient>, table: string, batchSize: number, dryRun = false,
) {
  if (!['all', 'venues', 'events', 'organizations', 'marketplace_brands'].includes(table)) throw new Error('invalid_logo_table')
  const [rules, denied] = await Promise.all([loadPlatformRules(db), loadDeniedMarks(db)])
  const selected = dryRun
    ? await db.from('logo_quality_jobs').select('*').eq('status', 'pending').limit(batchSize)
    : await db.rpc('logo_quality_claim', { p_table: table, p_limit: batchSize })
  if (selected.error) throw new Error(`logo worklist: ${selected.error.message}`)
  const jobs = ((selected.data ?? []) as LogoJob[]).filter(j => table === 'all' || j.entity_table === table)
  const tally: Record<string, number> = {}
  const resolutions = new Map<string, ReturnType<typeof resolveQualityLogo>>()
  let cursor = 0
  async function run() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++]
      let outcome: string = 'retry'
      try {
        // A venue and its organization often have the exact same name/site.
        // Reuse a recent completed check instead of fetching the site twice.
        if (job.expected_website) {
          const cached = await db.from('logo_quality_jobs').select('candidate_url,evidence,reason,status')
            .eq('expected_website', job.expected_website).eq('entity_name', job.entity_name)
            .in('status', ['repaired', 'verified', 'review'])
            .gte('checked_at', new Date(Date.now() - 24 * 3600_000).toISOString()).limit(1).maybeSingle()
          if (cached.error) throw new Error(`cache: ${cached.error.message}`)
          const row = cached.data
          if (row && row.evidence?.version === LOGO_QUALITY_VERSION && row.candidate_url &&
              !genericLogoAsset(String(row.evidence?.source_url ?? '')) && !denied.has(logoMarkSha256(row.candidate_url) ?? '')) {
            const automatic = row.evidence?.automatic === true &&
              (row.evidence?.on_ink !== true || ['venues', 'marketplace_brands'].includes(job.entity_table))
            const saved = dryRun ? null : await db.rpc('logo_quality_finish', {
              p_table: job.entity_table, p_id: job.entity_id, p_lease: job.lease,
              p_outcome: automatic ? (job.expected_url === row.candidate_url ? 'verified' : 'repaired') : 'review',
              p_url: row.candidate_url, p_reason: row.reason,
              p_evidence: { ...row.evidence, automatic, reused_check: true }, p_on_ink: row.evidence?.on_ink === true,
            })
            if (saved?.error) throw new Error(`finish: ${saved.error.message}`)
            outcome = saved?.data ?? (automatic ? 'repaired' : 'review')
            tally[outcome] = (tally[outcome] ?? 0) + 1
            continue
          }
        }
        const knownBad = denied.has(logoMarkSha256(job.expected_url) ?? '') || !!job.evidence?.blocked_url
        const website = typeof job.evidence?.discovered_website === 'string' ? job.evidence.discovered_website : job.expected_website
        const key = `${canonicalLogoWebsite(website)}|${job.entity_name.toLowerCase()}`
        if (!resolutions.has(key)) resolutions.set(key, resolveQualityLogo(job.entity_name, website, rules, denied, probeRealLogo))
        const resolution = await resolutions.get(key)!
        const candidate = resolution.candidate
        let candidateUrl: string | null = null
        let reason = resolution.reason
        const evidence: Record<string, unknown> = {
          version: LOGO_QUALITY_VERSION, canonical_website: resolution.website,
          source: candidate?.source ?? null, source_url: candidate?.sourceUrl ?? null,
          width: candidate?.width ?? null, height: candidate?.height ?? null,
          automatic: candidate?.automatic ?? false,
          on_ink: candidate?.onInk ?? false,
        }
        if (candidate && !dryRun) {
          candidateUrl = await mirrorLogoToR2(candidate.bytes, candidate.contentType)
          if (!candidateUrl) throw new Error('mirror_failed')
        }
        // Those two surfaces support a measured fixed background. Other entity
        // surfaces cannot yet guarantee a white mark will remain visible.
        const supportsInk = ['venues', 'marketplace_brands'].includes(job.entity_table)
        if (candidate?.automatic && (!candidate.onInk || supportsInk)) {
          outcome = candidateUrl === job.expected_url ? 'verified' : 'repaired'
        } else if (knownBad) {
          outcome = 'quarantined'
        } else if (resolution.retry) {
          outcome = 'retry'
        } else {
          outcome = 'review'
        }
        if (candidate?.automatic && candidate.onInk && !supportsInk) {
          outcome = knownBad ? 'quarantined' : 'review'
          evidence.automatic = false
          reason = 'white_logo_requires_background_review'
        }
        if (job.expected_url) {
          const prior = await fetchLogoResource(job.expected_url, 2 * 1024 * 1024, 'image/*')
          if (prior) {
            const measured = await inspectLogoBytes(prior)
            evidence.previous_quality = measured
            // A low-resolution result is never "fixed" by asking the CDN to enlarge it.
            if (!candidate?.automatic && !knownBad && !resolution.retry) reason = `${measured.reason}; ${reason}`
          } else evidence.previous_quality = { reason: 'unreachable' }
        }
        if (!dryRun) {
          const saved = await db.rpc('logo_quality_finish', {
            p_table: job.entity_table, p_id: job.entity_id, p_lease: job.lease,
            p_outcome: outcome, p_url: candidateUrl, p_reason: reason,
            p_evidence: evidence, p_on_ink: candidate?.onInk ?? false,
          })
          if (saved.error) throw new Error(`finish: ${saved.error.message}`)
          outcome = saved.data as string
        }
      } catch (e) {
        console.error('Logo quality job failed', job.entity_table, job.entity_id, (e as Error).message)
        if (!dryRun) {
          const saved = await db.rpc('logo_quality_finish', {
            p_table: job.entity_table, p_id: job.entity_id, p_lease: job.lease,
            p_outcome: 'retry', p_url: null, p_reason: 'temporary_processing_failure',
            p_evidence: { version: LOGO_QUALITY_VERSION }, p_on_ink: false,
          })
          outcome = saved.error ? 'error' : saved.data as string
        }
      }
      tally[outcome] = (tally[outcome] ?? 0) + 1
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, () => run()))
  return { processed: jobs.length, dry_run: dryRun, ...tally }
}
