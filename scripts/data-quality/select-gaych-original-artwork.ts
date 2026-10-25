// Small Deno bridge: the operator uses the deployed parser and its pinned HTML parser.
import { gaychEventArtworkEvidence } from '../../supabase/functions/_shared/gaych-parse.ts'
const input = JSON.parse(await new Response(Deno.stdin.readable).text())
console.log(JSON.stringify(gaychEventArtworkEvidence(input.html, input.event, input.page_url)))
