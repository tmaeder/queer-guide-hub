# Deploy Edge Functions

## Single function

```bash
npx supabase functions deploy <function-name> --project-ref xqeacpakadqfxjxjcewc
```

## All functions (prune removed ones)

```bash
npx supabase functions deploy --project-ref xqeacpakadqfxjxjcewc
```

Add `--prune` to delete remote functions that no longer exist locally.

## Verify

```bash
npx supabase functions list --project-ref xqeacpakadqfxjxjcewc | grep <name>
```

Check logs: https://supabase.com/dashboard/project/xqeacpakadqfxjxjcewc/functions

## Rollback

Redeploy from a previous git commit:

```bash
git stash
git checkout <commit>
npx supabase functions deploy <function-name> --project-ref xqeacpakadqfxjxjcewc
git checkout main
git stash pop
```

## Secrets

Set via CLI:
```bash
npx supabase secrets set KEY=value --project-ref xqeacpakadqfxjxjcewc
```

List current:
```bash
npx supabase secrets list --project-ref xqeacpakadqfxjxjcewc
```
