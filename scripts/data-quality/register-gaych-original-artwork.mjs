#!/usr/bin/env node
// Fresh bounded journals; never retry writes with unknown outcomes.
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, rename } from 'node:fs/promises'
const args = process.argv.slice(2), option = key => args.includes(key) ? args[args.indexOf(key) + 1] : null
const input = option('--proofs'), output = option('--output'), apply = args.includes('--apply'), rollback = args.includes('--rollback')
if (!input || !output || apply && rollback) throw Error('Provide --proofs and a fresh --output; choose at most one of --apply or --rollback')
try { await readFile(output); throw Error('Retain existing journals; use a fresh path') } catch (error) { if (error.code !== 'ENOENT') throw error }
const captured = JSON.parse(await readFile(input, 'utf8')), proofs = captured.proofs
if (!Array.isArray(proofs) || proofs.length > 20 || new Set(proofs.map(proof => proof.id)).size !== proofs.length) throw Error('At most twenty unique source proofs')
const journal = { input, apply, rollback, proofs, started_at: new Date().toISOString(), status: 'prepared', complete: false }
const save = async () => { await writeFile(output + '.tmp', JSON.stringify(journal, null, 2)); await rename(output + '.tmp', output) }
await save()
const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const token = raw.startsWith('go-keyring-base64:') ? Buffer.from(raw.slice(18), 'base64').toString('utf8') : raw
let query = await readFile(new URL('./promote-gaych-original-artwork.sql', import.meta.url), 'utf8')
query = query.replace('begin;', () => `begin;\nselect set_config('matching.gaych_original_proofs','${JSON.stringify(proofs).replaceAll("'", "''")}',true);\nselect set_config('matching.gaych_original_dry_run','${!apply && !rollback}',true);`)
if (rollback) query = query.replace(/commit;\s*$/, 'rollback;')
journal.status = 'submitting'; await save()
try {
  const response = await fetch('https://api.supabase.com/v1/projects/xqeacpakadqfxjxjcewc/database/query', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }), signal: AbortSignal.timeout(70_000),
  })
  const body = await response.text()
  if (!response.ok) throw Error('Native HTTP ' + response.status + '; reconcile before retry: ' + body.slice(0, 700))
  journal.result = JSON.parse(body)[0]?.result
  if (!journal.result || !journal.result.skipped && journal.result.dry_run !== (!apply && !rollback)) throw Error('Unexpected native receipt')
  journal.status = 'completed'; journal.complete = true; journal.finished_at = new Date().toISOString(); await save()
  console.log(JSON.stringify({ output, rollback, ...journal.result }))
} catch (error) { journal.status = 'outcome_unknown'; journal.error = error.message; await save(); throw error }
