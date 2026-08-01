#!/usr/bin/env node
/**
 * Guard for the whole Cloudflare Pages routing contract: public/_redirects,
 * public/_routes.json, and the deliberate absence of public/404.html.
 *
 * Everything here encodes a production outage from 2026-08-01, all of the
 * same shape — Cloudflare accepted the deploy, printed "Deployment complete",
 * and silently did nothing with the config.
 *
 *  1. `/*  /index.html  200` was DROPPED by the _redirects parser ("Infinite
 *     loop detected in this rule and has been ignored" — Pages strips
 *     `.html`/`/index` from the target, so the rule re-enters itself). Every
 *     deep route fell through to 404.html: /help, /city/:slug, every sitemap.
 *  2. Four `/assets/* /404.html 404` rules were rejected because 404 is not a
 *     legal status here. They sat in the file for months doing nothing.
 *  3. No public/_routes.json meant wrangler had to generate one, and it reads
 *     the generated file inside a bare `catch {}` (the `routesOutputPath`
 *     branch of `pages deploy`). When that read yields nothing the Functions
 *     bundle is uploaded with NO routing config, so Cloudflare never invokes
 *     it — every Pages Function 404s while the deploy stays green. Shipping
 *     the file explicitly takes the validated branch instead, which also logs
 *     "Uploading _routes.json" so the deploy proves it happened.
 *
 * Run via `npm run check:pages-routing` (prebuild + CI).
 */

import { existsSync, readFileSync } from 'node:fs';

const REDIRECTS = 'public/_redirects';
const ROUTES = 'public/_routes.json';
const NOT_FOUND_PAGE = 'public/404.html';

// The only statuses Cloudflare Pages accepts in _redirects. Anything else is
// rejected by the parser and the rule does nothing.
const VALID_STATUSES = new Set([200, 301, 302, 303, 307, 308]);

// Dynamic _redirects rules are those containing a splat or a :placeholder.
// Cloudflare caps these at 100 per project; rules past the cap are dropped.
const MAX_DYNAMIC_RULES = 100;

// _routes.json limits, mirrored from wrangler's validateRoutes().
const ROUTES_SPEC_VERSION = 1;
const MAX_ROUTES_RULES = 100;
const MAX_ROUTES_RULE_LENGTH = 100;

const errors = [];
const warnings = [];

// ---------------------------------------------------------------- _redirects

if (!existsSync(REDIRECTS)) {
  console.error(`::error::${REDIRECTS} is missing.`);
  process.exit(1);
}

// A 404.html in the build output disables Pages' built-in SPA fallback: every
// unmatched path would render the error page instead of the app.
if (existsSync(NOT_FOUND_PAGE)) {
  errors.push(
    `${NOT_FOUND_PAGE} exists. Pages serves it for every unmatched path, which ` +
      `disables the built-in SPA fallback and 404s every deep route. Delete it, ` +
      `or replace it with an equivalent fallback and update this check.`,
  );
}

const lines = readFileSync(REDIRECTS, 'utf8').split('\n');
let dynamicCount = 0;

lines.forEach((raw, i) => {
  const lineNo = i + 1;
  const line = raw.replace(/#.*$/, '').trim();
  if (!line) return;

  const [from, to, statusRaw] = line.split(/\s+/);
  if (!from || !to) {
    errors.push(`${REDIRECTS}:${lineNo} — malformed rule: "${raw.trim()}"`);
    return;
  }

  const status = statusRaw ? Number(statusRaw) : 302;
  if (/[*:]/.test(from)) dynamicCount += 1;

  if (!VALID_STATUSES.has(status)) {
    errors.push(
      `${REDIRECTS}:${lineNo} — status ${statusRaw} is not supported by Cloudflare ` +
        `Pages (only ${[...VALID_STATUSES].join(', ')}). The rule is silently ignored: "${line}"`,
    );
  }

  if (status === 200) {
    // Pages canonicalises `/index.html` -> `/` and strips `.html` / `/index`
    // from rewrite targets. A splat rule then re-matches its own target and
    // the parser drops it; a static rule 308-redirects instead of rewriting.
    if (to.endsWith('.html') || to.endsWith('/index')) {
      errors.push(
        `${REDIRECTS}:${lineNo} — 200-rewrite to "${to}". Pages strips \`.html\`/\`/index\` ` +
          `from the target, so this rule is either dropped as an infinite loop (splat rules) ` +
          `or 308-redirects instead of rewriting. No rewrite to /index.html can work: "${line}"`,
      );
    }

    // A 200-rewrite outranks static-asset serving, so a catch-all serves the
    // SPA shell for /robots.txt and every hashed /assets/**.{js,css} too.
    if (from === '/*' || from === '/:splat') {
      errors.push(
        `${REDIRECTS}:${lineNo} — catch-all 200-rewrite "${line}". 200-rewrites take ` +
          `precedence over static assets, so this serves the SPA HTML for /robots.txt and ` +
          `every hashed /assets/**.{js,css}, breaking MIME checks. SPA fallback is handled ` +
          `by Pages' built-in no-404.html behaviour instead.`,
      );
    }

    if (from === to) {
      errors.push(
        `${REDIRECTS}:${lineNo} — identity rewrite "${line}" creates an infinite rewrite ` +
          `loop that aborts rule parsing for the whole file.`,
      );
    }
  }
});

if (dynamicCount > MAX_DYNAMIC_RULES) {
  errors.push(
    `${REDIRECTS} has ${dynamicCount} dynamic rules (splat or :placeholder); Cloudflare ` +
      `Pages caps them at ${MAX_DYNAMIC_RULES} and drops the rest without an error.`,
  );
} else if (dynamicCount > MAX_DYNAMIC_RULES * 0.8) {
  warnings.push(
    `${REDIRECTS} has ${dynamicCount} dynamic rules, close to Cloudflare's ${MAX_DYNAMIC_RULES} cap.`,
  );
}

// -------------------------------------------------------------- _routes.json

let routeRuleCount = 0;

if (!existsSync(ROUTES)) {
  errors.push(
    `${ROUTES} is missing. Without it wrangler must generate the routing config, and it ` +
      `reads the generated file inside a bare \`catch {}\` — when that yields nothing the ` +
      `Functions bundle ships with no routes and Cloudflare never invokes it, so every ` +
      `Pages Function 404s on a green deploy. Ship the file explicitly.`,
  );
} else {
  let routes;
  try {
    routes = JSON.parse(readFileSync(ROUTES, 'utf8'));
  } catch (e) {
    errors.push(`${ROUTES} is not valid JSON: ${e.message}`);
  }

  if (routes) {
    const include = Array.isArray(routes.include) ? routes.include : null;
    const exclude = Array.isArray(routes.exclude) ? routes.exclude : [];

    if (routes.version !== ROUTES_SPEC_VERSION) {
      errors.push(`${ROUTES} — version must be ${ROUTES_SPEC_VERSION}, got ${routes.version}.`);
    }
    if (!include || include.length === 0) {
      errors.push(`${ROUTES} — must have at least one include rule, or Functions never run.`);
    }

    const all = [...(include ?? []), ...exclude];
    routeRuleCount = all.length;

    for (const rule of all) {
      if (typeof rule !== 'string' || !rule.startsWith('/')) {
        errors.push(
          `${ROUTES} — every rule must be a string starting with '/': ${JSON.stringify(rule)}`,
        );
      } else if (rule.length > MAX_ROUTES_RULE_LENGTH) {
        errors.push(
          `${ROUTES} — rule "${rule}" is ${rule.length} chars, over Cloudflare's ` +
            `${MAX_ROUTES_RULE_LENGTH}-character limit.`,
        );
      }
    }

    if (routeRuleCount > MAX_ROUTES_RULES) {
      errors.push(
        `${ROUTES} — ${routeRuleCount} include+exclude rules, over Cloudflare's ` +
          `${MAX_ROUTES_RULES} limit.`,
      );
    }

    // functions/_middleware.ts inspects /assets/ responses to turn a SPA-fallback
    // HTML answer for a hashed chunk into a real 404. Excluding those paths puts
    // that protection back to sleep, so say so rather than let it pass quietly.
    for (const rule of exclude) {
      if (typeof rule === 'string' && /^\/assets\//.test(rule)) {
        warnings.push(
          `${ROUTES} — exclude "${rule}" stops functions/_middleware.ts seeing /assets/ ` +
            `responses, so a missing hashed chunk answers 200 text/html again.`,
        );
      }
    }
  }
}

for (const w of warnings) console.warn(`::warning::${w}`);

if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`);
  console.error(`\nPages routing check FAILED (${errors.length} problem(s)).`);
  process.exit(1);
}

console.log(
  `Pages routing OK (_redirects: ${dynamicCount} dynamic rules, no catch-all; ` +
    `_routes.json: ${routeRuleCount} rule(s); no 404.html, so Pages' built-in SPA fallback serves index.html).`,
);
