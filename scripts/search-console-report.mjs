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
//
// Exits 0 on success; 78 (EX_CONFIG) when credentials are missing so cron runs
// don't page on first deploy; non-zero on any other failure.

import { writeFile, mkdir } from 'node:fs/promises';
import { createSign } from 'node:crypto';

const KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const PROPERTY = process.env.SEARCH_CONSOLE_PROPERTY;
const REPORT_DIR = process.env.REPORT_DIR ?? 'reports';
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS ?? 7);

if (!KEY || !PROPERTY) {
  console.error('Search Console reporting skipped: GOOGLE_SERVICE_ACCOUNT_KEY or SEARCH_CONSOLE_PROPERTY not set.');
  console.error('To enable: provision a service-account key, grant it Full access on the GSC property, and set both secrets.');
  process.exit(78);
}

const TODAY = new Date();
const END = TODAY.toISOString().slice(0, 10);
const startDate = new Date(TODAY);
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
  const sig = createSign('RSA-SHA256').update(unsigned).sign(serviceAccount.private_key);
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
  if (!res.ok) throw new Error(`Search Analytics query failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const sa = JSON.parse(KEY);
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

  const queryTable = (byQuery.rows ?? [])
    .map(
      (r) =>
        `| ${(r.keys[0] ?? '').replace(/\|/g, '\\|')} | ${r.clicks} | ${r.impressions} | ${fmtPct(r.ctr)} | ${fmtPos(r.position)} |`,
    )
    .join('\n');

  const pageTable = (byPage.rows ?? [])
    .map(
      (r) =>
        `| ${(r.keys[0] ?? '').replace(/\|/g, '\\|')} | ${r.clicks} | ${r.impressions} | ${fmtPct(r.ctr)} | ${fmtPos(r.position)} |`,
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
