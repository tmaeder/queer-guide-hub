// Direct Anthropic API fix runner — placeholder.
// When wired, this would: load the story + members, call Anthropic Messages
// with a tool-use loop (Read/Edit/Bash file tools running in a sandbox),
// open a PR, and call record_fix_proposed directly.
// Until then, the runner throws so dispatch_claude_routine cannot pick it.

import type { FixRunner } from './types.ts';

export const apiFixRunner: FixRunner = {
  name: 'api',
  // deno-lint-ignore require-await
  async dispatch() {
    throw new Error('api runner not_implemented — pick mock, github_actions, or webhook');
  },
};
