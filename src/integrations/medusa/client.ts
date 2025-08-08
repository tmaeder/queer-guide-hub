import Medusa from "@medusajs/medusa-js";

let BASE_URL = "http://localhost:9000";

// Allow configuring Medusa URL at runtime via localStorage or a global
if (typeof window !== "undefined") {
  const fromLS = window.localStorage.getItem("MEDUSA_URL");
  const fromGlobal = (window as any).__MEDUSA_URL__;
  BASE_URL = (fromLS || fromGlobal || BASE_URL) as string;
}

export const medusa = new Medusa({ baseUrl: BASE_URL, maxRetries: 3 });

export const getMedusaBaseUrl = () => BASE_URL;
