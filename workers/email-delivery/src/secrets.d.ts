// Secrets are supplied using wrangler secret put; these are not resource bindings.
interface Env {
  EMAIL_GATEWAY_SECRET: string;
  EMAIL_EVENTS_SECRET: string;
}
