import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import tsconfigPaths from "vite-tsconfig-paths";

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
    setupFiles: [],
  },
  server: {
    host: "::",
    port: parseInt(process.env.PORT || "8080"),
  },
  plugins: [
    react(),
    tsconfigPaths({ root: './' }),
    cfRocketLoaderBypass(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "~": path.resolve(__dirname, "./src"),
    },
  },
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
          if (id.includes('node_modules/@mui/') || id.includes('node_modules/@emotion/')) {
            return 'mui';
          }
          if (id.includes('node_modules/date-fns/')) {
            return 'utils';
          }
          if (id.includes('node_modules/react-force-graph') || id.includes('node_modules/force-graph') || id.includes('node_modules/d3-')) {
            return 'graph';
          }
          if (id.includes('node_modules/xlsx/')) {
            return 'xlsx';
          }
          if (id.includes('node_modules/maplibre-gl/') || id.includes('node_modules/@protomaps/')) {
            return 'maplibre';
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
    minify: mode === 'production' ? 'terser' : false,
    // Cloudflare Pages optimization
    target: 'esnext',
    sourcemap: mode === 'development',
    ...(mode === 'production' && {
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug'],
          passes: 2,
        },
        mangle: {
          safari10: true,
        },
        format: {
          comments: false,
        },
      },
      reportCompressedSize: false, // Faster builds for Cloudflare
      chunkSizeWarningLimit: 1000,
    }),
  },
}));
