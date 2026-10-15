# Website subpath setup for redirect domains

Extend the approved Dub Links parity scope using Dub's documented external-path
adapter model. A verified ready short-link subdomain remains the managed routing
host. An existing website forwards a chosen path prefix to that host. Keep stored
short URLs and all managed policies/analytics on that existing routing host.
Generate explicit configuration for Cloudflare Workers, Next.js, Vercel and
Netlify without changing the website, DNS or provider configuration automatically.

The owner opens an inline disclosure within the incumbent domain row, enters a
public HTTPS website origin and a safe non-root path prefix, chooses the platform,
and generates configuration. Show the exact example entry/destination, file or
route to configure, temporary-redirect semantics, preserved campaign/query data,
readiness requirements and that the browser moves to the short-link hostname.
Copy actions have pending/success/fallback feedback. Changing any input or routing
readiness clears generated configuration so stale output cannot be copied.

Validate origin without credentials, port, path, query or fragment; normalize IDN
and hostname case. Reject source/target host identity, private/reserved hosts,
root/ambiguous/encoded path prefixes and platform matcher metacharacters. Prefixes
are bounded ordinary ASCII segments with a leading slash. Reject reserved public
infrastructure prefixes such as API/auth/admin and .well-known. Reject disabled or
unready target domains for generation; archive alone does not disable routing.

The generated Cloudflare module is executable without secrets, packages or
bindings. Check the configured source origin, then only the exact prefix or a
prefix-plus-slash boundary. Unrelated paths pass through to the website origin.
Matched GET/HEAD requests receive an empty temporary307 with no-store and strict-origin-when-cross-origin referrer policy,
fixed target hostname, same suffix and exact original query. Other matched methods
return405 before forwarding anything. No visits are recorded until the managed
host receives the normal request. Provider config variants follow each platform's
published temporary-redirect/query behavior; Next basePath/locale additions are
explicitly disabled for an exact website path.

Operate-mode local extension: preserve existing domain settings, typography,
shared controls, native details/summary, wrapping actions and code fields. No new
visual world, tokens, assets or motion. Quality bar: labeled practical controls,
honest deployment/readiness states, readable configuration, source/target clarity,
no mobile overflow, keyboard access and explicit error/copy feedback. Inspect one
batched desktop1280x720/mobile390px round, one correction batch if needed, one
detector, fresh finish reviewer and documenter.

Verify validation and UI state/copy/readiness, then run the actual generated module
in workerd with every origin fetch isolated. Prove query/encoded suffix identity,
segment boundaries, exact hostname/HTTPS handling, GET/HEAD and method denial,
no cache/no response body and unchanged origin fallback. Connect its Location to
the actual signed branded Worker/resolver/database harness to prove password,
install markers, attribution and counting remain in the original routing pipeline.
Live website/provider installation remains a separate release requirement.

Sources: https://dub.co/help/article/how-to-use-dub-with-subpath,
https://nextjs.org/docs/app/api-reference/config/next-config-js/redirects,
https://vercel.com/docs/routing/redirects,
https://docs.netlify.com/manage/routing/redirects/redirect-options/,
https://developers.cloudflare.com/workers/configuration/routing/routes/.

The referrer policy retains the referring origin for cross-origin analytics while
excluding the referring page path/query. Query/campaign data in the visitor entry
is preserved explicitly. This matches normal browser origin-level forwarding
instead of suppressing referrer analytics at the extra adapter hop.
