#!/usr/bin/env node
// Weekly Google Search Console report.
//
// Pulls top queries, indexation count, CTR, and average position for the past
// 7 days from the Search Console API and writes a markdown report under
// reports/seo-weekly-YYYY-WW.md. Designed to run from a GitHub Action with the
// service-account credentials supplied as a secret.
//
// Required env vars:
//   GOOGLE_SERVICE_ACCOUNT_KEY  — full service-account key JSON (one line)
//                                 The service account must be granted "Full"
//                                 user access on the Search Console property.
//   SEARCH_CONSOLE_PROPERTY     — e.g. "sc-domain:queer.guide" or
//                                 "https://queer.guide/"
//
// Optional:
//   REPORT_DIR (default: "reports")
//   LOOKBACK_DAYS (default: 7)
//   LAG_DAYS (default: 3) — see below
//
// Exits 0 on success AND when credentials are missing (a skip is not a
// failure — GitHub treats any non-zero exit as red, which kept the weekly
// workflow permanently failing); non-zero on any other failure.

import { writeFile, mkdir } from 'node:fs/promises';
import { createSign } from 'node:crypto';

const KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const PROPERTY = process.env.SEARCH_CONSOLE_PROPERTY;
const REPORT_DIR = process.env.REPORT_DIR ?? 'reports';
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS ?? 7);
const LAG_DAYS = Number(process.env.LAG_DAYS ?? 3);

if (!KEY || !PROPERTY) {
  console.error('Search Console reporting skipped: GOOGLE_SERVICE_ACCOUNT_KEY or SEARCH_CONSOLE_PROPERTY not set.');
  console.error('To enable: provision a service-account key, grant it Full access on the GSC property, and set both secrets.');
  process.exit(0);
}

// The window ENDS at today - LAG_DAYS, not at today.
//
// Search Console's Performance data lands 2-3 days late. Querying through
// today therefore spends roughly three of a seven-day window on days that
// return nothing, so a "7 day" report silently described about four days and
// every week-on-week comparison ran low by a variable amount. The failure is
// invisible in the output — the numbers are real, just short — which is why it
// is worth being explicit about rather than leaving to be noticed.
const TODAY = new Date();
const endDate = new Date(TODAY);
endDate.setDate(endDate.getDate() - LAG_DAYS);
const END = endDate.toISOString().slice(0, 10);
const startDate = new Date(endDate);
startDate.setDate(startDate.getDate() - LOOKBACK_DAYS);
const START = startDate.toISOString().slice(0, 10);

const isoWeek = (d) => {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86400000;
  const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return { year: target.getUTCFullYear(), week };
};

// Captured from the key once parsed, so the 403 message can name the exact
// address that needs granting instead of telling the reader to go find it.
let SERVICE_ACCOUNT_EMAIL = null;

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  let sig;
  try {
    sig = createSign('RSA-SHA256').update(unsigned).sign(serviceAccount.private_key);
  } catch (err) {
    // Node reports a mangled PEM as `DECODER routines::unsupported`, which says
    // nothing about which secret is wrong. The realistic cause is a private_key
    // whose \n escapes were flattened by a shell or a copy-paste.
    throw new Error(
      `Could not sign the JWT with the supplied private_key (${err.message}).\n` +
        `The key is present but not a usable PEM. Almost always this is a private_key whose\n` +
        `newline escapes were lost — set the secret straight from the file, never by pasting:\n` +
        `  gh secret set GOOGLE_SERVICE_ACCOUNT_KEY < key.json`,
    );
  }
  const jwt = `${unsigned}.${b64url(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`OAuth token exchange failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function querySearchAnalytics(token, body) {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(PROPERTY)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const body = await res.text();
    // The two failures that actually happen on a first run, named instead of
    // dumped. Both are one-line fixes in a console, and a raw API body sends
    // the reader to the wrong place: a 403 here reads like a broken key when
    // the key is fine and the grant is missing.
    if (res.status === 403) {
      throw new Error(
        `Search Analytics 403 for "${PROPERTY}".\n` +
          `The credentials are valid but the service account is not authorised on this property.\n` +
          `Fix: Search Console -> that property -> Settings -> Users and permissions -> add\n` +
          `  ${SERVICE_ACCOUNT_EMAIL ?? '<the service account email>'}\n` +
          `with permission "Full" (Restricted is not enough for the API).\n` +
          `API said: ${body}`,
      );
    }
    if (res.status === 404) {
      throw new Error(
        `Search Analytics 404 for "${PROPERTY}".\n` +
          `The property string does not match a property this account can see. A DNS-verified\n` +
          `domain property is addressed as "sc-domain:queer.guide"; a URL-prefix property is the\n` +
          `full origin WITH the trailing slash, e.g. "https://queer.guide/". They are different\n` +
          `properties and are not interchangeable.\n` +
          `API said: ${body}`,
      );
    }
    throw new Error(`Search Analytics query failed: ${res.status} ${body}`);
  }
  return res.json();
}

async function main() {
  let sa;
  try {
    sa = JSON.parse(KEY);
  } catch {
    // A truncated or shell-mangled key is otherwise a bare SyntaxError with no
    // hint about which secret is at fault.
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON. Set it from the file directly ' +
        '(`gh secret set GOOGLE_SERVICE_ACCOUNT_KEY < key.json`) rather than pasting it.',
    );
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY parsed but has no client_email/private_key — ' +
        'that is an OAuth client secret, not a service-account key. Download the key ' +
        'from the service account itself (IAM -> Service Accounts -> Keys -> Add key -> JSON).',
    );
  }
  SERVICE_ACCOUNT_EMAIL = sa.client_email;
  const token = await getAccessToken(sa);

  const [byQuery, byPage, totals] = await Promise.all([
    querySearchAnalytics(token, {
      startDate: START,
      endDate: END,
      dimensions: ['query'],
      rowLimit: 25,
    }),
    querySearchAnalytics(token, {
      startDate: START,
      endDate: END,
      dimensions: ['page'],
      rowLimit: 25,
    }),
    querySearchAnalytics(token, {
      startDate: START,
      endDate: END,
      dimensions: [],
    }),
  ]);

  const totalRow = (totals.rows ?? [])[0] ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };

  const fmtPct = (n) => `${(n * 100).toFixed(2)}%`;
  const fmtPos = (n) => n.toFixed(1);
  const escapeMarkdownTableCell = (value) =>
    String(value ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/\|/g, '\\|');

  const queryTable = (byQuery.rows ?? [])
    .map(
      (r) =>
        `| ${escapeMarkdownTableCell(r.keys[0])} | ${r.clicks} | ${r.impressions} | ${fmtPct(r.ctr)} | ${fmtPos(r.position)} |`,
    )
    .join('\n');

  const pageTable = (byPage.rows ?? [])
    .map(
      (r) =>
        `| ${escapeMarkdownTableCell(r.keys[0])} | ${r.clicks} | ${r.impressions} | ${fmtPct(r.ctr)} | ${fmtPos(r.position)} |`,
    )
    .join('\n');

  const { year, week } = isoWeek(TODAY);
  const filename = `seo-weekly-${year}-${String(week).padStart(2, '0')}.md`;
  const filepath = `${REPORT_DIR}/${filename}`;

  const md = `# SEO weekly report — ${year}-W${String(week).padStart(2, '0')}

Property: \`${PROPERTY}\`
Window: ${START} → ${END} (${LOOKBACK_DAYS} days)

## Totals

| Clicks | Impressions | CTR | Avg position |
|---|---|---|---|
| ${totalRow.clicks} | ${totalRow.impressions} | ${fmtPct(totalRow.ctr)} | ${fmtPos(totalRow.position)} |

## Top queries

| Query | Clicks | Impressions | CTR | Avg position |
|---|---|---|---|---|
${queryTable || '| — | — | — | — | — |'}

## Top pages

| URL | Clicks | Impressions | CTR | Avg position |
|---|---|---|---|---|
${pageTable || '| — | — | — | — | — |'}

---

Generated by \`scripts/search-console-report.mjs\` on ${END}.
`;

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(filepath, md, 'utf8');
  console.log(`Wrote ${filepath}`);
  console.log(
    `Totals: ${totalRow.clicks} clicks, ${totalRow.impressions} impressions, CTR ${fmtPct(totalRow.ctr)}, pos ${fmtPos(totalRow.position)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
