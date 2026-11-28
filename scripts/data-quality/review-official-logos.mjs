/** Owner-authorized official-source review. No provider-only image is publishable. */
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import {
  REVIEW_VERSION,
  boundedFetch,
  extractOfficialMarks,
  normalizeReviewedImage,
  equivalentReviewedPixels,
  candidateState,
  canonicalResearchUrl,
  identityMatch,
  eventLogoEditionConflict,
  verifiedNativeLogoProof,
  revalidateInlineLogo,
  hash,
  owned,
} from './lib/official-logo-review.mjs';
const dir = process.env.LOGO_REVIEW_DIR;
if (!dir) throw Error('Set LOGO_REVIEW_DIR to an external private evidence directory');
const token = (await fs.readFile(dir + '/session.secret', 'utf8')).trim();
const endpoint = 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/logo-review-ops';
async function ops(body) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-logo-review-token': token },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const data = await r.json();
  if (!r.ok) throw Error(`${r.status}: ${JSON.stringify(data)}`);
  return data;
}
let nativeProofs = new Map();
try {
  nativeProofs = new Map(
    (await fs.readFile(dir + '/native-size-proof.ndjson', 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse)
      .map((p) => [p.key, p]),
  );
} catch {}
const mode = process.argv[2] ?? 'discover',
  limit = Number(process.env.REVIEW_LIMIT) || Infinity,
  concurrency = Number(process.env.REVIEW_CONCURRENCY) || 16;
await fs.mkdir(dir + '/evidence', { recursive: true });
function ocrWorker() {
  let child = null,
    timer,
    pending = [];
  function stop() {
    clearTimeout(timer);
    const former = child;
    child = null;
    former?.kill();
    const waiting = pending;
    pending = [];
    for (const resolve of waiting) resolve({ words: [], error: 'native_ocr_unavailable' });
  }
  function arm() {
    clearTimeout(timer);
    if (pending.length) timer = setTimeout(stop, 30000);
  }
  function start() {
    if (child) return;
    const current = spawn(dir + '/logo-ocr', [], { stdio: ['pipe', 'pipe', 'inherit'] });
    child = current;
    current.on('error', () => {
      if (child === current) stop();
    });
    current.on('exit', () => {
      if (child === current) stop();
    });
    readline.createInterface({ input: current.stdout }).on('line', (line) => {
      if (child !== current) return;
      const next = pending.shift();
      if (next) {
        try {
          next(JSON.parse(line));
        } catch {
          next({ words: [] });
        }
      }
      arm();
    });
    current.stdin.on('error', () => {
      if (child === current) stop();
    });
  }
  return {
    read: (path) =>
      new Promise((resolve) => {
        start();
        pending.push(resolve);
        if (pending.length === 1) arm();
        child.stdin.write(JSON.stringify({ id: path, path }) + '\n');
      }),
    close: stop,
  };
}
const ocrs = mode !== 'publish' ? Array.from({ length: 4 }, ocrWorker) : [];
let ocrIndex = 0;
let jobs = JSON.parse(await fs.readFile(dir + '/manifest.json', 'utf8'));
const file = dir + '/' + (mode === 'publish' ? 'published' : 'discovered') + '.ndjson';
let done = new Set();
try {
  const latest = new Map(
    (await fs.readFile(file, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse)
      .map((row) => [row.key, row]),
  );
  for (const row of latest.values()) {
    if (mode !== 'publish' || !['review_error', 'review_reopened'].includes(row.reason))
      done.add(row.key);
  }
} catch {}
if (mode === 'publish')
  jobs = (await fs.readFile(dir + '/discovered.ndjson', 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(JSON.parse)
    .filter((x) => x.approved);
if (mode === 'publish') {
  for (const approvedFile of [
    'semantic-approved.ndjson',
    'visual-approved.ndjson',
    'secondary-approved.ndjson',
    'retry-approved.ndjson',
    'research-approved.ndjson',
  ]) {
    try {
      jobs.push(
        ...(await fs.readFile(dir + '/' + approvedFile, 'utf8'))
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(JSON.parse),
      );
    } catch {}
  }
}
if (mode === 'publish') {
  let held = [];
  try {
    held = JSON.parse(await fs.readFile(dir + '/held-replacements.json', 'utf8'));
  } catch {}
  const keys = new Set(held.map((r) => r.key));
  jobs = jobs.filter((j) => !keys.has(j.key));
} else
  jobs.sort((a, b) => (canonicalResearchUrl(a) ?? '').localeCompare(canonicalResearchUrl(b) ?? ''));
jobs = [...new Map(jobs.map((j) => [j.key ?? j.entity_table + '/' + j.entity_id, j])).values()];
jobs = jobs.filter((j) => !done.has(j.key ?? j.entity_table + '/' + j.entity_id)).slice(0, limit);
const profiles = new Map();
if (mode === 'semantic') {
  for (let p = 0; p < jobs.length; p += 500) {
    const result = await ops({
      action: 'profiles',
      targets: jobs
        .slice(p, p + 500)
        .map((j) => ({ entity_table: j.entity_table, entity_id: j.entity_id })),
    });
    for (const r of result.profiles) profiles.set(r.entity_table + '/' + r.entity_id, r);
  }
}
let cursor = 0,
  count = 0,
  approved = 0,
  reasons = {};
const out = await fs.open(file, 'a');
async function inspect(job) {
  const key = job.entity_table + '/' + job.entity_id,
    site = canonicalResearchUrl(job),
    base = { key, job, site, version: REVIEW_VERSION };
  if (!site) return { ...base, reason: 'no_official_website' };
  if (
    /(?:^|\.)(?:facebook\.com|instagram\.com|x\.com|twitter\.com|linktr\.ee|tiktok\.com|youtube\.com|eventbrite\.com|eventbrite\.co\.uk|gaycities\.com|gaybasel\.ch|gay\.ch|wikipedia\.org)$/i.test(
      new URL(site).hostname,
    )
  )
    return { ...base, reason: 'platform_or_publisher_requires_official_source' };
  const fetched = await boundedFetch(site);
  if (!fetched) return { ...base, reason: 'official_site_unreachable' };
  if (!owned(site, fetched.url))
    return { ...base, reason: 'cross_site_redirect_requires_identity', redirect: fetched.url };
  const page = extractOfficialMarks(fetched.bytes.toString(), job, fetched.url, site);
  page.url = fetched.url;
  const brief = {
    url: page.url,
    title: page.title,
    metas: page.metas,
    ownerNames: page.ownerNames,
  };
  if (
    /casino|sportsbook|betting|wettanbieter|domain.{0,12}(?:sale|verkauf)/i.test(page.title) &&
    !/casino|sportsbook|betting|wettanbieter/i.test(job.entity_name)
  )
    return { ...base, page: brief, reason: 'potential_repurposed_domain' };
  if (mode !== 'semantic' && !page.literalIdentity && !page.domainIdentity)
    return { ...base, page: brief, reason: 'official_identity_not_established' };
  let failures = [],
    candidateEvidence = [];
  for (const c of page.candidates
    .filter(
      (c) =>
        c.strong ||
        (mode === 'semantic' &&
          c.declared &&
          (c.home ||
            c.source === 'official_jsonld' ||
            c.requiresWordmark ||
            c.source === 'official_document_logo')),
    )
    .slice(0, mode === 'semantic' ? 3 : 7)) {
    try {
      const asset = c.inline ? { inline: c.inline } : await boundedFetch(c.sourceUrl, 'image');
      if (!asset) {
        failures.push('asset_unreachable');
        continue;
      }
      const normalized = await normalizeReviewedImage(asset),
        id = hash(c.sourceUrl),
        path = dir + '/evidence/' + id + '.png';
      await fs.writeFile(path, normalized.png);
      await fs.writeFile(dir + '/evidence/' + id + '-preview.png', normalized.preview);
      const ocr = await ocrs[ocrIndex++ % ocrs.length].read(
        dir + '/evidence/' + id + '-preview.png',
      );
      const text = ocr.words
        .filter((w) => w.confidence >= 0.3)
        .map((w) => w.text)
        .join(' ');
      const otherYear = eventLogoEditionConflict(job, text);
      const evidence = {
        official_page: page.url,
        source_url: c.sourceUrl,
        source: c.source,
        method: 'official_dom_and_ocr',
        title: page.title,
        declared_label: c.label,
        dom_location: c.context,
        home_link: !!c.home,
        organization_name: c.ownerName ?? null,
        ocr: text,
        original_sha256: normalized.originalHash,
        width: normalized.width,
        height: normalized.height,
        original_width: normalized.originalWidth,
        original_height: normalized.originalHeight,
        background: normalized.background,
        review_version: REVIEW_VERSION,
        ...(job.discovered_website ? { discovered_website: job.discovered_website } : {}),
      };
      const item = { image: path, evidence, state: candidateState(job, page, c, text) };
      candidateEvidence.push(item);
      if (otherYear) {
        failures.push('different_event_edition');
        continue;
      }
      if (
        mode === 'semantic' &&
        (!c.requiresVisual ||
          (identityMatch(job.entity_name, text, job.entity_table) && text.length <= 180)) &&
        !c.nativeResolutionUnknown &&
        normalized.entropy <= 6.5
      ) {
        const meaningful =
          job.entity_name
            .normalize('NFKD')
            .replace(/\p{M}/gu, '')
            .toLowerCase()
            .match(/[\p{L}\p{N}]{4,}/gu) ?? [];
        if (
          meaningful.some(
            (w) =>
              ![
                'pride',
                'center',
                'centre',
                'club',
                'cafe',
                'hotel',
                'health',
                'community',
                'association',
                'organization',
                'foundation',
                'restaurant',
                'lgbtq',
                'street',
                'event',
                'events',
                'first',
                'church',
                'christ',
                'sexual',
                'sante',
              ].includes(w) &&
              text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().includes(w),
          )
        ) {
          const profile = profiles.get(key),
            state = item.state;
          state.target = {
            ...state.target,
            known_business_address: profile?.address ?? '',
            known_country: profile?.country ?? '',
            existing_description: profile?.description ?? '',
          };
          const request = { action: 'judge', state };
          const response = await ops(request);
          item.evidence.typed_review = { model: response.model, answers: response.answers };
          await fs.appendFile(
            dir + '/typed-decisions.ndjson',
            JSON.stringify({ key, job, request, response, item }) + '\n',
          );
          const a = response.answers;
          if (
            a?.own_identity?.noul >= 0.97 &&
            a?.declared_logo?.noul >= 0.97 &&
            (job.entity_table !== 'events' || a?.conflicting_edition?.noul <= 0.03)
          )
            return {
              ...base,
              page: brief,
              approved: true,
              ...item,
              evidence: { ...item.evidence, method: 'official_dom_and_typed_review' },
              reason: 'official_dom_and_typed_review',
            };
        }
      }
      if (
        mode !== 'semantic' &&
        !c.requiresVisual &&
        !c.nativeResolutionUnknown &&
        normalized.entropy <= 6.5 &&
        identityMatch(job.entity_name, text, job.entity_table)
      )
        return { ...base, page: brief, approved: true, ...item, reason: 'official_dom_and_ocr' };
    } catch (e) {
      failures.push(e.message);
    }
  }
  return {
    ...base,
    page: brief,
    reason: !page.candidates.some((c) => c.strong)
      ? 'no_verified_official_logo_declaration'
      : 'wordmark_requires_visual_review',
    failures,
    candidates: candidateEvidence,
  };
}
async function work() {
  for (;;) {
    const index = cursor++;
    if (index >= jobs.length) return;
    const job = jobs[index];
    let result;
    try {
      if (mode === 'publish') {
        if (
          job.evidence.reviewed_background &&
          !['paper', 'ink', 'neutral'].includes(job.evidence.reviewed_background)
        )
          throw Error('invalid_reviewed_background');
        if (job.job.discovered_website)
          job.evidence.discovered_website = job.job.discovered_website;
        if (eventLogoEditionConflict(job.job, job.evidence.ocr))
          throw Error('different_event_edition');
        let png = await fs.readFile(job.image);
        const proof = nativeProofs.get(job.key);
        const nativeVerified = verifiedNativeLogoProof(proof, job.evidence);
        if (nativeVerified) job.evidence.native_source_dimensions = proof.native;
        if (
          (await import('../../supabase/functions/_shared/logo-quality.ts')).transformedLogoRequest(
            job.evidence.source_url,
          ) &&
          !nativeVerified
        )
          throw Error('native_resolution_requires_verification');
        if (job.evidence.method !== 'official_dom_and_visual_review') {
          const sharp = (await import('sharp')).default;
          if ((await sharp(png).stats()).entropy > 6.5)
            throw Error('photographic_image_requires_visual_review');
        }
        if (job.evidence.source === 'official_inline_svg') {
          const page = await boundedFetch(job.evidence.official_page);
          if (!page) throw Error('official_inline_page_unreachable');
          const n = await revalidateInlineLogo(
            page.bytes.toString(),
            job.job,
            page.url,
            job.evidence,
            png,
          );
          png = n.png;
          job.evidence.source_sha256_at_publish = n.originalHash;
          job.evidence.inline_source_revalidated = true;
          job.evidence.width = n.width;
          job.evidence.height = n.height;
          job.evidence.background = n.background;
        } else {
          const asset = await boundedFetch(job.evidence.source_url, 'image');
          if (!asset) throw Error('source_no_longer_reachable');
          const normalized = await normalizeReviewedImage(asset, {
            background: job.evidence.reviewed_background,
          });
          if (normalized.originalHash !== job.evidence.original_sha256) {
            const formerGround = await normalizeReviewedImage(asset, {
              background: job.evidence.background,
            });
            if (
              !(await equivalentReviewedPixels(png, normalized.png)) &&
              !(await equivalentReviewedPixels(png, formerGround.png))
            )
              throw Error('official_source_changed');
            job.evidence.source_reencoded_without_pixel_change = true;
            job.evidence.source_sha256_at_publish = normalized.originalHash;
          }
          png = normalized.png;
          job.evidence.background = normalized.background;
          job.evidence.width = normalized.width;
          job.evidence.height = normalized.height;
        }
        result = {
          key: job.key,
          name: job.job.entity_name,
          ...(await ops({
            action: 'publish',
            approval: { ...job.job, png_base64: png.toString('base64'), evidence: job.evidence },
          })),
        };
      } else {
        let timer;
        try {
          result = await Promise.race([
            inspect(job),
            new Promise((_, reject) => {
              timer = setTimeout(
                () => reject(Error('official_review_timed_out')),
                Number(process.env.REVIEW_TIMEOUT_MS) || (mode === 'semantic' ? 120000 : 45000),
              );
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      }
    } catch (e) {
      result = {
        key: job.key ?? job.entity_table + '/' + job.entity_id,
        job,
        reason: 'review_error',
        error: e.message,
      };
    }
    await out.write(JSON.stringify(result) + '\n');
    count++;
    if (result.approved) approved++;
    const reason = result.outcome ?? result.reason;
    reasons[reason] = (reasons[reason] ?? 0) + 1;
    if (count % 50 === 0) globalThis.gc?.();
    if (count % 100 === 0)
      console.log(
        JSON.stringify({ mode, processed: count, total: jobs.length, approved, reasons }),
      );
  }
}
await Promise.all(Array.from({ length: concurrency }, work));
await out.close();
for (const w of ocrs) w.close();
console.log(JSON.stringify({ mode, processed: count, total: jobs.length, approved, reasons }));
