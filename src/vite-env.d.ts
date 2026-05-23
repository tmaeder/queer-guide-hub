/// <reference types="vite/client" />

// Injected by `define` in vite.config.ts at build time. Consumed by
// src/utils/buildVersion.ts to detect when a new build has shipped.
declare const __BUILD_ID__: string;
