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
      JSON.stringify(process.env.VITE_SUPABASE_URL ?? "https://xqeacpakadqfxjxjcewc.supabase.co"),
    // anon key is publishable — safe to ship in client. Override per-build via env if needed.
    "import.meta.env.VITE_SUPABASE_ANON_KEY":
      JSON.stringify(
        process.env.VITE_SUPABASE_ANON_KEY ??
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8",
      ),
  },
});
