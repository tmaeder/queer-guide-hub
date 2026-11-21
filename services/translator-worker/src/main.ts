// queer.guide translator worker — runs on the home NAS next to llama.cpp.
//
//   node src/main.ts                 loop: claim → translate → commit
//   node src/main.ts backfill --entity venues --locales de,fr [--limit 500] [--priority 10]
//   node src/main.ts status          queue counts (translation_queue_signals)
//
// All traffic is outbound: this process calls Supabase (HTTPS) and llm:8080 on
// the private Docker network. Logs carry ids, languages, durations and token
// counts — never content text, never secrets.
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  checkGlossary,
  checkOutput,
  chunkText,
  detectLanguage,
  inQuietHours,
  mask,
  unmask,
  type Glossary,
} from './text.ts';

const env = (k: string, d?: string) => {
  const v = process.env[k] ?? d;
  if (v === undefined) throw new Error(`missing env ${k}`);
  return v;
};

const SUPABASE_URL = env('SUPABASE_URL').replace(/\/$/, '');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const LLM_URL = env('LLM_URL', 'http://llm:8080').replace(/\/$/, '');
const MODEL = env('MODEL_NAME', 'translategemma-4b-it.Q4_K_M');
const QUIET_HOURS = env('QUIET_HOURS', '07-23'); // local hours when only demand jobs run
const QUIET_MIN_PRIORITY = Number(env('QUIET_MIN_PRIORITY', '50'));
const MIN_MEM_AVAILABLE_MB = Number(env('MIN_MEM_AVAILABLE_MB', '3072'));
const IDLE_MS = Number(env('IDLE_MS', '30000'));
const GLOSSARY: Glossary = JSON.parse(readFileSync(new URL('../glossary.json', import.meta.url), 'utf8'));

const log = (event: string, fields: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));

// No parameter properties: Node's type stripping rejects them.
class JobError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(code: string, retryable: boolean) {
    super(code);
    this.code = code;
    this.retryable = retryable;
  }
}

// ---------------------------------------------------------------------------
// Supabase (PostgREST RPC with the service role)
// ---------------------------------------------------------------------------
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { apikey: SERVICE_KEY, 'Content-Type': 'application/json' };
  // Legacy JWT service keys go in Authorization too; new sb_secret_ keys must not.
  if (SERVICE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SERVICE_KEY}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    // PostgREST error bodies can echo arguments (= content); log the code only.
    const code = await res
      .json()
      .then((j: { code?: string }) => j.code ?? '')
      .catch(() => '');
    throw new Error(`rpc ${fn} http ${res.status} ${code}`.trim());
  }
  return (await res.json()) as T;
}

interface Job {
  job_id: number;
  entity_type: string;
  entity_id: string;
  field: string;
  target_lang: string;
  attempts: number;
  source_hash: string;
  source_text: string | null;
  context_text: string | null;
  protected_name: string | null;
}

// ---------------------------------------------------------------------------
// llama.cpp
// ---------------------------------------------------------------------------
async function llm<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${LLM_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new JobError('llm_unavailable', true);
  }
  if (!res.ok) throw new JobError(`llm_http_${res.status}`, res.status >= 500);
  return (await res.json()) as T;
}

/** Renders the GGUF's own chat template server-side (llama.cpp reads it from
 *  the model metadata), so the worker never hand-builds the prompt. */
async function renderPrompt(text: string, source: string, target: string): Promise<string> {
  const r = await llm<{ prompt: string }>('/apply-template', {
    messages: [{ role: 'user', content: text }],
    chat_template_kwargs: { source_lang_code: source, target_lang_code: target },
    add_generation_prompt: true,
  }, 30_000);
  return r.prompt;
}

interface Completion {
  content: string;
  stop_type?: string;
  timings?: { prompt_n: number; predicted_n: number };
}

/** Streams /completion. A non-streamed reply sends no headers until it is
 *  done, and Node's fetch (undici) gives up on headers after 5 minutes — a
 *  long chunk on a busy NAS took longer than that. Streaming also lets
 *  llama.cpp stop generating as soon as we abort. */
async function complete(body: Record<string, unknown>, timeoutMs: number): Promise<Completion> {
  let res: Response;
  try {
    res = await fetch(`${LLM_URL}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, stream: true }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new JobError('llm_unavailable', true);
  }
  if (!res.ok || !res.body) throw new JobError(`llm_http_${res.status}`, res.status >= 500);
  let content = '';
  let final: (Completion & { stop?: boolean }) | null = null;
  let buf = '';
  const decoder = new TextDecoder();
  try {
    for await (const bytes of res.body) {
      buf += decoder.decode(bytes, { stream: true });
      for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        const ev = JSON.parse(line.slice(5)) as Completion & { stop?: boolean };
        content += ev.content ?? '';
        if (ev.stop) final = ev;
      }
    }
  } catch {
    throw new JobError('llm_stream_error', true);
  }
  if (!final) throw new JobError('llm_stream_error', true);
  return { content, stop_type: final.stop_type, timings: final.timings };
}

async function translateChunk(text: string, source: string, target: string, name: string | null) {
  let tokensIn = 0;
  let tokensOut = 0;
  const masked = mask(text, name ? [name] : []);
  const prompt = await renderPrompt(masked.text, source, target);
  for (let attempt = 0; attempt < 2; attempt++) {
    // One retry for a lost token, sampled: temperature 0 would reproduce it.
    const r = await complete({
      prompt,
      temperature: attempt === 0 ? 0 : 0.3,
      seed: 7,
      n_predict: 1200,
      cache_prompt: true,
    }, 15 * 60_000);
    tokensIn += r.timings?.prompt_n ?? 0;
    tokensOut += r.timings?.predicted_n ?? 0;
    if (r.stop_type === 'limit') throw new JobError('truncated', false);
    const restored = unmask(r.content.trim(), masked);
    if (restored === null) continue;
    const bad = checkOutput(text, restored, target, source);
    if (bad) throw new JobError(bad, false);
    // No retry: measured, a sampled retry reproduced the same terminology
    // and once changed a fact (Friday → Thursday). The page shows the original.
    const miss = checkGlossary(text, restored, target, GLOSSARY);
    if (miss) throw new JobError(miss, false);
    return { text: restored, tokensIn, tokensOut };
  }
  throw new JobError('token_lost', false);
}

async function processJob(job: Job) {
  const t0 = Date.now();
  const base = { job: job.job_id, entity: job.entity_type, id: job.entity_id, field: job.field, lang: job.target_lang, attempt: job.attempts };
  const source = job.source_text ?? '';
  try {
    if (!source.trim()) {
      await rpc('skip_translation_job', { p_job_id: job.job_id, p_reason: 'empty_source' });
      log('skip', { ...base, reason: 'empty_source' });
      return;
    }
    const sourceLang = detectLanguage(job.context_text || source);
    if (sourceLang === job.target_lang) {
      // Already in the target language: record the source as the translation so
      // the page stops asking for one.
      const r = await rpc<string>('commit_translation', {
        p_job_id: job.job_id, p_text: source, p_source_hash: job.source_hash, p_source_lang: sourceLang, p_model: 'identity',
      });
      log('done', { ...base, src: sourceLang, result: r, ms: Date.now() - t0 });
      return;
    }
    let out = '';
    let tokensIn = 0;
    let tokensOut = 0;
    const chunks = chunkText(source);
    for (const c of chunks) {
      if (!c.text.trim()) {
        out += c.text + c.sep;
        continue;
      }
      const r = await translateChunk(c.text, sourceLang, job.target_lang, job.protected_name);
      out += r.text + c.sep;
      tokensIn += r.tokensIn;
      tokensOut += r.tokensOut;
    }
    const result = await rpc<string>('commit_translation', {
      p_job_id: job.job_id, p_text: out.trim(), p_source_hash: job.source_hash, p_source_lang: sourceLang, p_model: MODEL,
    });
    log('done', { ...base, src: sourceLang, chunks: chunks.length, tokens_in: tokensIn, tokens_out: tokensOut, result, ms: Date.now() - t0 });
  } catch (e) {
    const err = e instanceof JobError ? e : new JobError('worker_error', true);
    if (!(e instanceof JobError)) log('worker_error', { ...base, error: String((e as Error)?.message ?? e).slice(0, 120) });
    try {
      const status = await rpc<string>('fail_translation_job', { p_job_id: job.job_id, p_error: err.code, p_retryable: err.retryable });
      log('fail', { ...base, code: err.code, status, ms: Date.now() - t0 });
    } catch (e2) {
      // Couldn't record the failure; the job is reclaimed after 30 min.
      log('fail_unrecorded', { ...base, code: err.code, error: String((e2 as Error)?.message).slice(0, 120) });
    }
    if (err.code === 'llm_unavailable') await sleep(60_000);
  }
}

// ---------------------------------------------------------------------------
// Scheduling guards
// ---------------------------------------------------------------------------
/** Host-wide MemAvailable (Docker does not virtualise /proc/meminfo). */
function memAvailableMb(): number {
  try {
    const m = readFileSync('/proc/meminfo', 'utf8').match(/^MemAvailable:\s+(\d+) kB/m);
    return m ? Number(m[1]) / 1024 : Infinity;
  } catch {
    return Infinity;
  }
}

async function loop() {
  let stopping = false;
  for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => (stopping = true));
  log('start', { model: MODEL, quiet_hours: QUIET_HOURS, min_mem_mb: MIN_MEM_AVAILABLE_MB });
  let lastPrune = 0;
  let memWaitLogged = false;
  while (!stopping) {
    const mem = memAvailableMb();
    if (mem < MIN_MEM_AVAILABLE_MB) {
      if (!memWaitLogged) log('mem_wait', { mem_available_mb: Math.round(mem) });
      memWaitLogged = true;
      await sleep(IDLE_MS);
      continue;
    }
    memWaitLogged = false;
    if (Date.now() - lastPrune > 6 * 3600_000) {
      try {
        log('prune', { deleted: await rpc<number>('prune_translation_jobs', {}) });
      } catch (e) {
        log('prune_error', { error: String((e as Error).message).slice(0, 120) });
      }
      lastPrune = Date.now();
    }
    const minPriority = inQuietHours(new Date(), QUIET_HOURS) ? QUIET_MIN_PRIORITY : 0;
    let jobs: Job[];
    try {
      jobs = await rpc<Job[]>('claim_translation_jobs', { p_limit: 1, p_min_priority: minPriority });
    } catch (e) {
      log('claim_error', { error: String((e as Error).message).slice(0, 120) });
      await sleep(IDLE_MS);
      continue;
    }
    if (!jobs.length) {
      await sleep(IDLE_MS);
      continue;
    }
    await processJob(jobs[0]);
  }
  log('stop');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const cmd = process.argv[2];
if (cmd === 'backfill') {
  const n = await rpc<number>('enqueue_translation_backfill', {
    p_entity_type: arg('entity') ?? 'venues',
    p_locales: (arg('locales') ?? 'de,fr,es,it,pt,ru,zh,ja,ko,ar').split(','),
    p_limit: Number(arg('limit') ?? 500),
    p_priority: Number(arg('priority') ?? 10),
  });
  log('backfill', { entity: arg('entity') ?? 'venues', enqueued: n });
} else if (cmd === 'status') {
  console.log(JSON.stringify(await rpc('translation_queue_signals', {}), null, 2));
} else {
  await loop();
}
