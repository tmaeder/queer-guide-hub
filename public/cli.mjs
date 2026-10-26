#!/usr/bin/env node
// Official Queer Guide CLI. Node.js 22+, no dependencies or credentials.
import { pathToFileURL } from 'node:url';

const HELP = `Queer Guide CLI 1.0.0
Usage: node queer-guide.mjs <command> [--json]
  pages [--prefix SLUG]     List public introductory pages
  page SLUG                Read a page (home is the homepage)
  search QUERY             Search the live public guide
  --help                   Show usage without a network request
  --version                Show the CLI version
Options: --base-url URL     Override the content API for local testing
         --search-url URL   Override the public search service for local testing
Public reads are free and anonymous. This CLI does not sign in or write data.
Docs: https://queer.guide/docs`;

async function readJson(response) {
  if (!response.body) throw new Error('The service returned an empty response.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2 * 1024 * 1024) {
        await reader.cancel();
        throw new Error('The service response exceeded 2 MiB. Narrow your query.');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json'))
    throw new Error('The service returned an unsupported response format.');
  try { return JSON.parse(text); }
  catch { throw new Error('The service returned invalid JSON.'); }
}

function origin(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))))
    throw new Error('Service overrides must be HTTPS origins or HTTP loopback origins.');
  return url.origin;
}

const plain = (value) => String(value ?? '').replace(/\p{Cc}/gu, ' ');

export async function run(args, io = {}) {
  const write = io.write ?? console.log;
  const error = io.error ?? console.error;
  const request = io.fetch ?? fetch;
  const json = args.includes('--json');
  try {
    if (args.includes('--help') || args.length === 0) { write(HELP); return 0; }
    if (args.length === 1 && args[0] === '--version') { write('1.0.0'); return 0; }
    let base = 'https://queer.guide';
    let search = 'https://search.queer.guide';
    let prefix;
    const words = [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--json') continue;
      if (['--base-url', '--search-url', '--prefix'].includes(arg)) {
        const value = args[++i];
        if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}.`);
        if (arg === '--base-url') base = origin(value);
        else if (arg === '--search-url') search = origin(value);
        else prefix = value;
      } else if (arg.startsWith('--')) throw new Error(`Unknown option: ${plain(arg)}.`);
      else words.push(arg);
    }
    const [command, ...values] = words;
    if (!['pages', 'page', 'search'].includes(command)) throw new Error('Choose pages, page or search; see --help.');
    if (prefix !== undefined && (command !== 'pages' || Array.from(prefix).length > 128))
      throw new Error('--prefix is supported only for pages and must be at most 128 characters.');
    if ((command === 'pages' && values.length) || (command === 'page' && values.length !== 1) ||
        (command === 'search' && (!values.length || values.join(' ').length > 200)))
      throw new Error('Invalid command arguments; see --help. Search queries must be 1–200 characters.');
    let url = base + '/api/v1/pages';
    if (command === 'page') url += '/' + encodeURIComponent(values[0]);
    if (prefix !== undefined) url += '?' + new URLSearchParams({ prefix });
    if (command === 'search') url = search + '/search';
    const response = await request(url, {
      method: command === 'search' ? 'POST' : 'GET',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json',
        'User-Agent': 'QueerGuideCLI/1.0 (+https://queer.guide/docs)' },
      ...(command === 'search' ? { body: JSON.stringify({ query: values.join(' '), filters: {}, hitsPerPage: 5, page: 0 }) } : {}),
      signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    if (!response.ok) {
      if (response.body) await response.body.cancel();
      const retry = response.headers.get('retry-after');
      const seconds = /^\d{1,6}$/.test(retry ?? '') ? ` Retry after ${retry} seconds.` : '';
      const e = new Error(`Public service returned HTTP ${response.status}.${seconds}`);
      e.code = response.status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR';
      throw e;
    }
    const data = await readJson(response);
    if (command === 'pages' && !Array.isArray(data?.pages)) throw new Error('Invalid page catalog response.');
    if (command === 'page' && (typeof data?.title !== 'string' || !Array.isArray(data?.paragraphs)))
      throw new Error('Invalid page response.');
    if (command === 'search' && !Array.isArray(data?.hits)) throw new Error('Invalid search response.');
    if (json) write(JSON.stringify(data, null, 2));
    else if (command === 'pages') write(data.pages.map((p) => `${plain(p.slug)}\t${plain(p.title)}\t${plain(p.url)}`).join('\n'));
    else if (command === 'page') write([plain(data.title), ...data.paragraphs.map(plain), plain(data.url)].join('\n\n'));
    else write(data.hits.map((h) => [h.title ?? h.name ?? h.objectID,
      h.type ?? h.content_type, h.slug ?? h.objectID ?? h.id, h.url ?? h.metadata?.url]
      .map(plain).join('\t')).join('\n'));
    return 0;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed.';
    const code = e?.code ?? 'CLI_ERROR';
    error(json ? JSON.stringify({ error: { code, message, hint: 'See https://queer.guide/docs or run --help.' } }) : plain(message));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await run(process.argv.slice(2));
