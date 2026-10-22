#!/usr/bin/env bash
# Run a Supabase CLI command, falling back across image registries.
# Shared GitHub runners hit pull limits on each of them at different times
# (ghcr.io "toomanyrequests", public.ecr.aws "Data limit exceeded", 2026-10-22).
for reg in public.ecr.aws ghcr.io docker.io; do
  echo "::group::supabase $* via $reg"
  if SUPABASE_INTERNAL_IMAGE_REGISTRY=$reg supabase "$@"; then echo "::endgroup::"; exit 0; fi
  echo "::endgroup::"; echo "::warning::supabase $1 failed via $reg"
  supabase stop --no-backup >/dev/null 2>&1 || true
done
exit 1
