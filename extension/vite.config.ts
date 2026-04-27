/// <reference types="node" />
import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import manifest from "./manifest.json";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    target: "esnext",
    rollupOptions: {
      input: {
        popup: "src/popup/index.html",
      },
    },
  },
  define: {
    "import.meta.env.VITE_SUBMIT_API":
      JSON.stringify(process.env.VITE_SUBMIT_API ?? "https://submit.queer.guide"),
    "import.meta.env.VITE_SUPABASE_URL":
      JSON.stringify(process.env.VITE_SUPABASE_URL ?? ""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY":
      JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY ?? ""),
  },
});
