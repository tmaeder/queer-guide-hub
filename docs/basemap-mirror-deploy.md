# Mirror Protomaps basemap assets to our R2 bucket

PR #764 made the basemap assets URL configurable via
`VITE_BASEMAP_ASSETS_URL` and added a sync script. Until those assets
actually serve from our own infra, `/map` still hits
`protomaps.github.io` — rate-limited GitHub Pages, disallowed by GitHub
TOS for primary infra.

This doc covers the operator steps to flip the switch.

## 1. Sync upstream assets to R2

The existing `protomaps-tiles` Cloudflare Worker has an R2 binding
(`BUCKET = protomaps-tiles`). The sync script uploads under the
`basemaps-assets/` prefix so the same bucket serves both PMTiles and
asset files.

```sh
cd Dev/web
R2_BUCKET=protomaps-tiles ./scripts/sync-basemap-assets.sh v5.7.0
```

The script clones `protomaps/basemaps-assets@v5.7.0`, then uses
`wrangler r2 object put` for each file:

- `sprites/v4/light{,@2x}.{json,png}`
- `sprites/v4/dark{,@2x}.{json,png}`
- All `fonts/<fontstack>/<range>.pbf` glyph files

Re-run on Protomaps version bumps. Match `@protomaps/basemaps` in
`package.json` (currently `^5.7.0` → upstream tag `v5.7.0`).

## 2. Add an `/basemaps-assets/*` route to the worker

The PMTiles worker entry point is at
`Dev/tiles-worker/PMTiles/serverless/cloudflare/src/index.ts`
(the PMTiles dir is gitignored — it's an upstream clone). Add this
helper at the top of the fetch handler (before the `tile_path` call):

```ts
async function serveBasemapAsset(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (!pathname.startsWith("/basemaps-assets/")) return null;
  const key = decodeURIComponent(pathname.slice(1));
  const obj = await env.BUCKET.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  if (key.endsWith(".json")) headers.set("Content-Type", "application/json");
  else if (key.endsWith(".png")) headers.set("Content-Type", "image/png");
  else if (key.endsWith(".pbf")) headers.set("Content-Type", "application/x-protobuf");
  headers.set("Cache-Control", env.CACHE_CONTROL ?? "public, max-age=2592000");
  if (env.ALLOWED_ORIGINS) {
    for (const o of env.ALLOWED_ORIGINS.split(",")) {
      if (o === request.headers.get("Origin") || o === "*") {
        headers.set("Access-Control-Allow-Origin", o);
        break;
      }
    }
  }
  headers.set("Vary", "Origin");
  return new Response(obj.body, { headers, status: 200 });
}
```

And in the fetch handler, after the `URL` parse:

```ts
const assetResp = await serveBasemapAsset(request, env, url.pathname);
if (assetResp) return assetResp;
```

Deploy:

```sh
cd Dev/tiles-worker/PMTiles/serverless/cloudflare
npx wrangler deploy
```

## 3. Flip the build env var

Set in the production Cloudflare Pages build env (or wherever the SPA
is built):

```
VITE_BASEMAP_ASSETS_URL=https://protomaps-tiles.maeder-tobiassimon.workers.dev/basemaps-assets
```

Or, if a custom domain like `tiles.queer.guide` is wired:

```
VITE_BASEMAP_ASSETS_URL=https://tiles.queer.guide/basemaps-assets
```

`mapStyle.ts` already reads this env var and falls back to
`protomaps.github.io` if unset, so this change is non-breaking until
the env var is set.

## 4. Verify

After deploy:

- `curl -s -I https://<your-host>/basemaps-assets/sprites/v4/light.json | head` → 200, JSON content-type.
- Open `/map` in production → DevTools network panel → confirm sprite + glyph PBF requests hit `<your-host>` and not `protomaps.github.io`.
- Map attribution shows both "Protomaps" and "OpenStreetMap" with anchors (already in #764).
