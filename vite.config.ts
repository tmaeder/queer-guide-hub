import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The commit this bundle was built from. Names the build in /build-id.txt
// (src/utils/buildVersion.ts) and is the Sentry release, both for the
// source-map upload below and for the runtime tag the client reports.
//
// CF_PAGES_COMMIT_SHA is injected only by Cloudflare's OWN Pages build system,
// and this project does not use it: .github/workflows/deploy-pages.yml builds
// in a GitHub Actions runner and pushes the result with `wrangler pages
// deploy`. So it was never set on the live deploy path and the timestamp
// always won — measured on prod 2026-08-21, /build-id.txt served
// `local-1787327428937`, naming no commit, and VITE_SENTRY_RELEASE below was
// the empty string on every release ever shipped. GITHUB_SHA is set
// automatically in every Actions runner, so it covers deploy-pages.yml and the
// mirror build with nothing declared in either workflow. CF_PAGES_COMMIT_SHA
// stays first in case the native Pages build is ever reconnected.
const COMMIT_SHA = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || '';

// Pinned per build. Used by src/utils/buildVersion.ts to detect that a new
// version has shipped while a tab is open. Two builds of the same commit now
// genuinely share a version — which is the stated intent, and also means a
// same-commit redeploy no longer rotates the entry chunk's hash. See the
// built-asset sweep in scripts/smoke-pages.sh, which reasons about that.
const BUILD_ID = COMMIT_SHA || `local-${Date.now()}`;

// Emit /build-id.txt into the build output so the running app can
// fetch it on visibilitychange and compare against the build it booted
// with. Served by CF Pages with the default /*.txt cache rule (5 min).
function emitBuildIdFile(): Plugin {
  return {
    name: 'emit-build-id-file',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist');
      try {
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, 'build-id.txt'), BUILD_ID + '\n', 'utf8');
      } catch {
        // Best-effort: if the dist dir isn't writable the version-check
        // util simply gets a 404 and skips its notification.
      }
    },
  };
}

// Prevent Cloudflare Rocket Loader from mangling ES module script tags
function cfRocketLoaderBypass(): Plugin {
  return {
    name: 'cf-rocket-loader-bypass',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/<script(?![^>]*data-cfasync)/g, '<script data-cfasync="false"');
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  test: {
    globals: true,
    environment: 'jsdom',
    // `functions/` is the Cloudflare Pages edge tree. It is NOT under src/, so
    // a test placed there was previously never executed by any runner — the
    // same gap that hid 38 of 45 edge-function tests until 2026-08-02.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'functions/**/*.{test,spec}.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // maplibre asks for its worker as `?worker&url`, which Vite's test
    // transform refuses to resolve ("Denied ID"). The failure is a COLLECTION
    // error, so the whole suite reports 0 tests — eight files across the repo
    // (VenueDetail.parts, EventDetail, EntityDetail, SearchResults, Venues,
    // HotelDetail…) had been silently contributing nothing, and the count
    // looked healthy because vitest reports "N passed" for the files that did
    // collect. Aliasing the worker to a stub fixes the class rather than
    // adding a per-file `vi.mock` each time someone trips over it.
    alias: [
      {
        find: /maplibre-gl\/dist\/maplibre-gl-worker\.mjs\?worker&url$/,
        replacement: path.resolve(__dirname, './src/test/stubs/emptyWorkerUrl.ts'),
      },
    ],
    // 5s default flakes under parallel load (saturated CI workers /
    // concurrent local suites); headroom above asyncUtilTimeout (5s)
    // set in src/test/setup.ts.
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/**/__tests__/**',
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/integrations/supabase/types.ts',
      ],
      // Phase 6 floor (last bumped 2026-05-16, ratchet 2). Thresholds
      // tuned just below current measured coverage so this commit doesn't
      // break CI but new code can't ratchet down. Bump these every quarter
      // as coverage rises.
      // Measured at ratchet 2: lines 39.48, statements 37.34, branches 28.91, functions 30.46.
      thresholds: {
        lines: 38,
        statements: 36,
        branches: 27,
        functions: 28,
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: parseInt(process.env.PORT || '8080'),
  },
  plugins: [
    react(),
    tailwindcss(),
    cfRocketLoaderBypass(),
    emitBuildIdFile(),
    mode === 'production' &&
      sentryVitePlugin({
        org: process.env.SENTRY_ORG || 'maedertobiassimon',
        project: process.env.SENTRY_PROJECT || 'javascript-react',
        authToken: process.env.SENTRY_AUTH_TOKEN,
        release: {
          name: COMMIT_SHA || undefined,
        },
        sourcemaps: {
          filesToDeleteAfterUpload: ['./dist/assets/js/*.map'],
        },
        telemetry: false,
      }),
    process.env.BUNDLE_STATS === '1' &&
      visualizer({
        filename: 'bundle-baselines/stats.html',
        template: 'treemap',
        gzipSize: true,
        brotliSize: true,
        sourcemap: false,
      }),
  ].filter(Boolean),
  define: {
    // Must resolve to the SAME string as the sentryVitePlugin release above,
    // or the maps upload under one release and the events arrive tagged with
    // another (or, as until 2026-08-21, with none at all — src/sentry.ts maps
    // '' to undefined) and no stack trace symbolicates.
    'import.meta.env.VITE_SENTRY_RELEASE': JSON.stringify(COMMIT_SHA),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // P0 audit follow-up: boneyard-js/react bundles its own React, which
    // ends up in a separate Vite optimizeDeps cache bucket from the app's
    // React, producing two `useRef` implementations and the classic
    // "Invalid hook call" error on every <Skeleton> render in dev. Force
    // dedupe so both modules share one instance.
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // Pre-bundle boneyard-js/react against the same React instance Vite
    // already has cached, so the Skeleton hooks resolve to the same
    // dispatcher as the rest of the app.
    //
    // Pre-bundle clsx + tailwind-merge + cva (the trio used by
    // `src/lib/utils.ts#cn()` on every page) so rolldown sees them as
    // canonical shared modules. Without this, recharts pre-bundles clsx
    // into its own chunk and every cn() consumer transitively static-
    // imports the recharts chunk — dragging ~92 KB onto pages that don't
    // use any chart.
    include: ['boneyard-js/react', 'clsx', 'tailwind-merge', 'class-variance-authority'],
    // maplibre-gl 6 derives its worker URL at runtime from a template
    // variable, so the dep optimizer can't emit maplibre-gl-worker.mjs and the
    // map hangs forever in dev. Excluding it serves maplibre from source.
    //
    // The production build has the SAME defect — "prod build is unaffected"
    // stood in this comment while every map on the live site was dead. It is
    // fixed in src/config/maplibreWorker.ts, which bundles the worker
    // explicitly and hands MapLibre the URL; do not assume a bundler can
    // resolve that runtime path.
    exclude: ['maplibre-gl'],
  },
  // Workers are a SEPARATE rolldown build and it does not inherit `build.minify`
  // below — the maplibre worker emitted at 615 KB of tab-indented source until
  // this was set. Check the emitted size, not the config, after a vite bump.
  worker: {
    rollupOptions: {
      output: { minify: mode === 'production' },
    },
  },
  esbuild:
    mode === 'production'
      ? {
          drop: ['console', 'debugger'],
          legalComments: 'none',
        }
      : {},
  build: {
    rollupOptions: {
      output: {
        // Vendor chunking via rolldown's native `advancedChunks` (replaces the
        // old `manualChunks` callback). We MUST use advancedChunks (not
        // manualChunks) because the Vite/rolldown `__vitePreload` runtime helper
        // is a virtual module (`\0vite/preload-helper.js`) emitted natively by
        // rolldown — it does NOT pass through `manualChunks`. Left to itself
        // rolldown parked the helper inside the first lazy chunk it landed in
        // (`pdfjs`), and since EVERY chunk that does a dynamic import() imports
        // the helper, the entry then statically pulled that 428KB pdfjs chunk
        // onto the critical path of every page. The first group below re-homes
        // the helper into `vendor` (already modulepreloaded).
        //
        // Groups are matched by `test` (regex on module id). Equal priority →
        // lower array index wins, so this list preserves the exact order of the
        // former manualChunks if-chain (e.g. d3-* → `graph` before `recharts`).
        // minSize/minShareCount floors force every matched module into its group
        // regardless of size or how many entries use it (manualChunks semantics).
        advancedChunks: {
          minSize: 0,
          minModuleSize: 0,
          minShareCount: 1,
          groups: [
            // __vitePreload helper → vendor (must win, hence highest priority)
            { name: 'vendor', test: /preload-helper/, priority: 100 },
            // React core MUST be in its own chunk to avoid circular deps
            { name: 'vendor', test: /node_modules\/react(-dom)?\// },
            { name: 'router', test: /node_modules\/react-router\// },
            // Styling micro-deps (clsx + tailwind-merge + cva) → utils, which
            // is already on every page's preload list. Without this rolldown
            // homes the canonical clsx inside the RECHARTS chunk (its biggest
            // sharer), so the entry statically imports recharts — which chains
            // to graph (d3) and tiptap — on every public page (~1.2 MB raw).
            // See docs/perf/recharts-cross-route-leak.md. NOTE: this is the
            // ordered-group variant, NOT the priority-100 group that failed in
            // #1122 — measured entry sizes below before merging.
            {
              name: 'utils',
              test: /node_modules\/(clsx|tailwind-merge|class-variance-authority|use-sync-external-store)\//,
            },
            { name: 'utils', test: /node_modules\/date-fns\// },
            { name: 'graph', test: /node_modules\/(react-force-graph|force-graph|d3-)/ },
            { name: 'exceljs', test: /node_modules\/exceljs\// },
            { name: 'maplibre', test: /node_modules\/(maplibre-gl|@protomaps)\// },
            {
              name: 'tiptap',
              test: /node_modules\/(@tiptap|lowlight|prosemirror-|highlight\.js)\//,
            },
            { name: 'pdfjs', test: /node_modules\/pdfjs-dist\// },
            { name: 'mammoth', test: /node_modules\/mammoth\// },
            { name: 'boneyard', test: /node_modules\/boneyard-js\// },
            { name: 'sentry', test: /node_modules\/@sentry\// },
            { name: 'i18n', test: /node_modules\/(i18next|react-i18next)/ },
            { name: 'framer-motion', test: /node_modules\/(motion|motion-dom|motion-utils)\// },
            { name: 'radix', test: /node_modules\/@radix-ui\// },
            { name: 'react-query', test: /node_modules\/@tanstack\/(react-query|query-)/ },
            { name: 'lucide', test: /node_modules\/lucide-react\// },
            { name: 'supabase', test: /node_modules\/@supabase\// },
            { name: 'recharts', test: /node_modules\/(recharts|victory-vendor)\// },
            { name: 'xyflow', test: /node_modules\/@xyflow\// },
            { name: 'dnd-kit', test: /node_modules\/@dnd-kit\// },
            // Keep scheduler with React
            { name: 'vendor', test: /node_modules\/scheduler\// },
          ],
        },
        // Optimize for Cloudflare Pages
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || 'asset';
          const info = name.split('.');
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `assets/images/[name]-[hash][extname]`;
          }
          if (/css/i.test(ext)) {
            return `assets/css/[name]-[hash][extname]`;
          }
          return `assets/[name]-[hash][extname]`;
        },
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
      },
    },
    cssCodeSplit: true,
    minify: mode === 'production' ? 'esbuild' : false,
    // Strip heavy route-only chunks from the entry's modulepreload list.
    // These get loaded lazily by the routes that need them; preloading on
    // every page wastes ~600 KB on first paint.
    modulePreload: {
      resolveDependencies(_filename, deps) {
        const skip =
          /\b(recharts|graph|exceljs|pdfjs|mammoth|tiptap|maplibre|framer-motion|boneyard|xyflow|dnd-kit)-[A-Za-z0-9_-]+\.js$/;
        return deps.filter((d) => !skip.test(d));
      },
    },
    // Cloudflare Pages optimization
    target: 'es2022',
    sourcemap: mode === 'production' ? 'hidden' : true,
    ...(mode === 'production' && {
      reportCompressedSize: false,
      chunkSizeWarningLimit: 1000,
    }),
  },
}));
