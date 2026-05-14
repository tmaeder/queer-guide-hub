# Emergency Rollback

## Frontend (Cloudflare Pages)

1. Go to https://dash.cloudflare.com > Pages > queer-guide
2. Deployments tab > find last known-good deployment
3. Click "..." > "Rollback to this deployment"

Takes effect in ~30 seconds globally.

## Edge functions

Redeploy from a known-good commit:
```bash
git log --oneline supabase/functions/<function-name>/ -5  # find good commit
git show <commit>:supabase/functions/<function-name>/index.ts > /tmp/rollback.ts
# Or just checkout and deploy:
git stash && git checkout <commit>
npx supabase functions deploy <function-name> --project-ref xqeacpakadqfxjxjcewc
git checkout main && git stash pop
```

## Database migration rollback

Supabase doesn't support `migrate down`. Write a new migration that reverses the change:
```bash
npx supabase migration new revert_<description>
# Edit the file with reverse DDL
npx supabase db push --project-ref xqeacpakadqfxjxjcewc
```

For data-only changes, use the SQL editor in the dashboard.

## Cloudflare Workers

```bash
cd workers/search-proxy
wrangler rollback  # rolls back to previous deployment
```

## Full incident checklist

1. Identify: what broke? (Sentry alerts, user reports, monitoring)
2. Contain: rollback the specific component (see above)
3. Verify: check https://queer.guide returns 200, key flows work
4. Communicate: if user-facing, note in admin dashboard
5. Root-cause: after stabilization, investigate and fix forward
