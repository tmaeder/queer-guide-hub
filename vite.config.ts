import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Pinned per build. Used by src/utils/buildVersion.ts to detect that a
// new version has shipped while a tab is open. Prefer the CF Pages
// commit SHA so two builds of the same source share a version; fall
// back to a build-time timestamp for local builds.
const BUILD_ID = process.env.CF_PAGES_COMMIT_SHA || `local-${Date.now()}`;

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
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
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
    host: "127.0.0.1",
    port: parseInt(process.env.PORT || "8080"),
  },
  plugins: [
    react(),
    tailwindcss(),
    cfRocketLoaderBypass(),
    emitBuildIdFile(),
    mode === 'production' && sentryVitePlugin({
      org: process.env.SENTRY_ORG || 'maedertobiassimon',
      project: process.env.SENTRY_PROJECT || 'javascript-react',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: {
        name: process.env.CF_PAGES_COMMIT_SHA || undefined,
      },
      sourcemaps: {
        filesToDeleteAfterUpload: ['./dist/assets/js/*.map'],
      },
      telemetry: false,
    }),
    process.env.BUNDLE_STATS === '1' && visualizer({
      filename: 'bundle-baselines/stats.html',
      template: 'treemap',
      gzipSize: true,
      brotliSize: true,
      sourcemap: false,
    }),
  ].filter(Boolean),
  define: {
    'import.meta.env.VITE_SENTRY_RELEASE': JSON.stringify(process.env.CF_PAGES_COMMIT_SHA || ''),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
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
  },
  esbuild: mode === 'production' ? {
    drop: ['console', 'debugger'],
    legalComments: 'none',
  } : {},
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
            { name: 'utils', test: /node_modules\/date-fns\// },
            { name: 'graph', test: /node_modules\/(react-force-graph|force-graph|d3-)/ },
            { name: 'exceljs', test: /node_modules\/exceljs\// },
            { name: 'maplibre', test: /node_modules\/(maplibre-gl|@protomaps)\// },
            { name: 'tiptap', test: /node_modules\/(@tiptap|lowlight|prosemirror-|highlight\.js)\// },
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
