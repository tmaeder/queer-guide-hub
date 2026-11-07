import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { chmod, copyFile, link, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

async function identify(file) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { sha256: hash.digest('hex'), bytes };
}

async function storeEvidence(root, input) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(join(root, '.capture-'));
  const stagedBody = join(staging, 'body');

  try {
    await copyFile(input, stagedBody, constants.COPYFILE_EXCL);
    const identity = await identify(stagedBody);
    if (identity.bytes === 0) throw new Error('Cannot store an empty evidence body');

    const directory = join(root, 'sha256', identity.sha256.slice(0, 2));
    const path = join(directory, identity.sha256);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(stagedBody, 0o400);

    try {
      // Publish a complete object atomically. The temporary link is removed
      // below, so a publisher capture is never linked to its mutable input.
      await link(stagedBody, path);
      return { ...identity, path, reused: false };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = await identify(path);
      if (existing.sha256 !== identity.sha256 || existing.bytes !== identity.bytes) {
        throw new Error('Existing evidence object does not match its hash');
      }
      return { ...identity, path, reused: true };
    }
  } finally {
    await rm(stagedBody, { force: true });
    // Each invocation owns a fresh staging directory.
    await rm(staging, { recursive: true });
  }
}

const [root, input, ...extra] = process.argv.slice(2);
if (!root || !input || extra.length) {
  console.error('Usage: node store-review-evidence.mjs <object-store> <fresh-capture-file>');
  process.exitCode = 2;
} else {
  try {
    console.log(JSON.stringify(await storeEvidence(resolve(root), resolve(input))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
