// Connection to the LIVE Queer.guide Supabase project.
// The anon key is the public, RLS-protected key (same one hardcoded in the main
// app's src/integrations/supabase/client.ts) — safe to embed. It grants ONLY
// what row-level security allows: public read of personalities, no writes.
//
// v1 is read-only by design: no login, no INSERT/UPDATE. Editing (v2) needs an
// admin login and is gated off. See README.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co'

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZWFjcGFrYWRxZnhqeGpjZXdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0Mzk1MDQsImV4cCI6MjA2ODAxNTUwNH0.o38QZPRBDyi52MWrMHT2qMvByx1z_u_Ox_r5rmRBxK8'

// Hard read-only switch. Flip to false in v2 once admin login + write UI land.
export const READ_ONLY = true

// Beruf/Tätigkeit-Trennung (personalities.roles text[]).
// Migration 20260716120000_person_roles_field.sql ist live (Spalte + Backfill),
// darum aktiv: Feld greift überall (Select, Edit-Maske, Detail, Freitext).
// Siehe docs/roles-field-concept.md.
export const ROLES_ENABLED = true

export const PAGE_SIZE = 50

// Page-size options for Liste + Upcoming (default 25).
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 25
