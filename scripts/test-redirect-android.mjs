import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  nativeTestWire,
  nativeHandoffTestWire,
  nativePlayReferrerTestWire,
} from './lib/redirect-native-test-wire.mjs';
import { buildAndroidPlatform } from './lib/redirect-android-platform-build.mjs';
import { delimiter, join, resolve } from 'node:path';

// Dedicated local SDK/JDK paths are optional; CI uses setup-java and Maven.
const javaHome = process.env.REDIRECT_JAVA_HOME || process.env.JAVA_HOME;
const maven = process.env.REDIRECT_MAVEN_BIN || 'mvn';
const env = { ...process.env, ...(javaHome ? { JAVA_HOME: javaHome } : {}) };
const sdk = resolve('sdk/redirects/android');
execFileSync(
  maven,
  [
    '-B',
    '-ntp',
    '-f',
    join(sdk, 'pom.xml'),
    'test-compile',
    'dependency:build-classpath',
    '-Dmdep.outputFile=target/contract-classpath.txt',
  ],
  { env, stdio: 'inherit', timeout: 240000 },
);
const dependencies = readFileSync(join(sdk, 'target/contract-classpath.txt'), 'utf8').trim();
const classpath = [
  join(sdk, 'target/classes'),
  join(sdk, 'target/test-classes'),
  dependencies,
].join(delimiter);
const output = mkdtempSync(join(tmpdir(), 'qg-android-wire-'));
try {
  const wire = join(output, 'native-wire.json');
  writeFileSync(wire, await nativeTestWire());
  const handoffWire = join(output, 'handoff-wire.json');
  const handoff = await nativeHandoffTestWire();
  writeFileSync(handoffWire, handoff);
  const referrer = join(output, 'play-referrer.txt');
  writeFileSync(referrer, await nativePlayReferrerTestWire(JSON.parse(handoff)));
  execFileSync(
    javaHome ? join(javaHome, 'bin/java') : 'java',
    ['-cp', classpath, 'guide.queer.redirects.ContractTests', wire, handoffWire],
    { env, stdio: 'inherit', timeout: 70000 },
  );
  const platformClasspath = await buildAndroidPlatform({ tests: true });
  execFileSync(
    javaHome ? join(javaHome, 'bin/java') : 'java',
    [
      '-cp',
      platformClasspath,
      'guide.queer.redirects.PlatformContractTests',
      handoffWire,
      referrer,
    ],
    { env, stdio: 'inherit', timeout: 70000 },
  );
} finally {
  rmSync(output, { recursive: true, force: true });
}
