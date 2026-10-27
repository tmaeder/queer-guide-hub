/** Programmatic entry point for the standalone public CLI. */
export function run(args: string[], io?: {
  fetch?: typeof globalThis.fetch;
  write?: (message: string) => void;
  error?: (message: string) => void;
}): Promise<number>;
