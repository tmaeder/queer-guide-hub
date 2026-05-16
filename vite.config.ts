import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
      // Phase 6 floor (2026-05-16). Thresholds tuned just below current
      // measured coverage so this commit doesn't break CI but new code
      // can't ratchet down. Bump these every quarter as coverage rises.
      // Baseline at lock: lines 21.7, branches 15.1, functions 15.9.
      thresholds: {
        lines: 20,
        statements: 19,
        branches: 13,
        functions: 14,
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
    include: ['boneyard-js/react'],
  },
  esbuild: mode === 'production' ? {
    drop: ['console', 'debugger'],
    legalComments: 'none',
  } : {},
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React core MUST be in its own chunk to avoid circular deps
          if (id.includes('node_modules/react-dom/') || id.includes('node_modules/react/')) {
            return 'vendor';
          }
          if (id.includes('node_modules/react-router-dom/') || id.includes('node_modules/react-router/') || id.includes('node_modules/@remix-run/')) {
            return 'router';
          }
          if (id.includes('node_modules/date-fns/')) {
            return 'utils';
          }
          if (id.includes('node_modules/react-force-graph') || id.includes('node_modules/force-graph') || id.includes('node_modules/d3-')) {
            return 'graph';
          }
          if (id.includes('node_modules/exceljs/')) {
            return 'exceljs';
          }
          if (id.includes('node_modules/maplibre-gl/') || id.includes('node_modules/@protomaps/')) {
            return 'maplibre';
          }
          if (id.includes('node_modules/@tiptap/') || id.includes('node_modules/lowlight/') || id.includes('node_modules/prosemirror-') || id.includes('node_modules/highlight.js/')) {
            return 'tiptap';
          }
          if (id.includes('node_modules/hls.js/')) {
            return 'hls';
          }
          if (id.includes('node_modules/pdfjs-dist/')) {
            return 'pdfjs';
          }
          if (id.includes('node_modules/mammoth/')) {
            return 'mammoth';
          }
          if (id.includes('node_modules/gsap/')) {
            return 'gsap';
          }
          if (id.includes('node_modules/boneyard-js/')) {
            return 'boneyard';
          }
          if (id.includes('node_modules/@sentry/')) {
            return 'sentry';
          }
          if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next/')) {
            return 'i18n';
          }
          if (
            id.includes('node_modules/framer-motion/') ||
            id.includes('node_modules/motion/') ||
            id.includes('node_modules/motion-dom/') ||
            id.includes('node_modules/motion-utils/')
          ) {
            return 'framer-motion';
          }
          if (id.includes('node_modules/@radix-ui/')) {
            return 'radix';
          }
          if (
            id.includes('node_modules/@tanstack/react-query') ||
            id.includes('node_modules/@tanstack/query-')
          ) {
            return 'react-query';
          }
          if (id.includes('node_modules/lucide-react/')) {
            return 'lucide';
          }
          if (id.includes('node_modules/@supabase/')) {
            return 'supabase';
          }
          if (id.includes('node_modules/recharts/') || id.includes('node_modules/victory-vendor/')) {
            return 'recharts';
          }
          // i18n locale JSON files: split per-language so only the active
          // locale ends up downloaded. src/i18n/locales/<lang>.json
          const localeMatch = id.match(/[\\/]src[\\/]i18n[\\/]locales[\\/]([a-z-]+)\.json$/);
          if (localeMatch) {
            return `locale-${localeMatch[1]}`;
          }
          // Keep scheduler with React
          if (id.includes('node_modules/scheduler/')) {
            return 'vendor';
          }
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
          /\b(recharts|graph|exceljs|pdfjs|mammoth|tiptap|maplibre|gsap|hls|framer-motion|boneyard)-[A-Za-z0-9_-]+\.js$/;
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
