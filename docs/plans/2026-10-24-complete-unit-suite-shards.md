# Complete unit coverage with a shorter release gate

Strict up-to-date branch protection repeatedly invalidated the producer release while the serial unit suite occupied almost the entire 30-minute job. Run the same discovered unit files in four native Vitest shards. Merchant/server regressions still run once. Keep the required `test` check as the aggregate, and keep every existing coverage floor in vite.config.ts unchanged.

Shard jobs collect coverage without per-shard floors; the aggregate merges native coverage maps and applies the original floors to their union. Every shard must succeed. Required report artifacts carry the exact commit, shard identity, installed Vitest version and content digest. The aggregate rejects missing, unexpected or altered inputs, then checks that every discovered test file appears exactly once in the merged results. Artifact transport failures fail this gate; the existing optional diagnostic coverage upload remains optional.

Validation: 11 adversarial manifest/result tests pass. A real four-file native Vitest fixture passes with combined 100% line/statement/branch/function floors. Removing one blob fails transport completeness; merging only three reports also fails the 100% statement and branch floors. The workflow parses with unique YAML keys. No production test exclusions, retry policy, coverage floors or branch protection changed.
