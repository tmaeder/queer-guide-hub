# Archived migrations

184 Lovable-era migrations (2025-07 → 2026-04) whose timestamps are recorded
in remote `supabase_migrations.schema_migrations`. They are kept here for
historical reference and emergency replay; the active flat migration folder
at `../` is what `supabase db push` / CI picks up.

Supabase CLI scans the migrations directory non-recursively, so files in
this subfolder are automatically skipped.

Do not move files back into the parent directory unless you intend to
re-apply them — the remote schema already reflects their effects.
