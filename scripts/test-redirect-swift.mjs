import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { nativeTestWire, nativeHandoffTestWire } from './lib/redirect-native-test-wire.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (process.platform !== 'darwin')
  throw new Error('Swift native client tests require an Apple Foundation runtime.');
const output = mkdtempSync(join(tmpdir(), 'qg-redirect-swift-'));
try {
  execFileSync(
    'swift',
    [
      'build',
      '--package-path',
      'sdk/redirects/swift',
      '--scratch-path',
      join(output, 'package'),
      '-Xswiftc',
      '-warnings-as-errors',
    ],
    { stdio: 'inherit', timeout: 180000 },
  );
  const binary = join(output, 'contracts');
  execFileSync(
    'swiftc',
    [
      '-parse-as-library',
      '-warnings-as-errors',
      'sdk/redirects/swift/Sources/QueerGuideRedirects/RedirectClient.swift',
      'sdk/redirects/swift/Sources/QueerGuideRedirects/RedirectAppGroupHandoffStore.swift',
      'sdk/redirects/swift/Tests/QueerGuideRedirectsTests/RedirectClientTests.swift',
      '-o',
      binary,
    ],
    { stdio: 'inherit', timeout: 180000 },
  );
  const wire = join(output, 'native-wire.json');
  writeFileSync(wire, await nativeTestWire());
  const handoffWire = join(output, 'handoff-wire.json');
  writeFileSync(handoffWire, await nativeHandoffTestWire());
  execFileSync(binary, [wire, handoffWire], { stdio: 'inherit', timeout: 30000 });
} finally {
  rmSync(output, { recursive: true, force: true });
}
