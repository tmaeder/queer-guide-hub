import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Compile against published framework/Google classes, never handwritten stubs.
// Neither dependency is copied into our optional adapter JAR.
export async function buildAndroidPlatform({ tests = false } = {}) {
  const sdk = resolve('sdk/redirects/android');
  const target = join(sdk, 'platform/target');
  const cache = join(target, 'provided');
  mkdirSync(cache, { recursive: true });
  const artifacts = [
    [
      'install-referrer-2.2.aar',
      'https://dl.google.com/dl/android/maven2/com/android/installreferrer/installreferrer/2.2/installreferrer-2.2.aar',
      '7112e592c429949787c168c5ac62721144a73b649050684557fdbdba5dd3b66a',
    ],
    [
      'android-api21.jar',
      'https://repo.maven.apache.org/maven2/org/robolectric/android-all/5.0.2_r3-robolectric-r0/android-all-5.0.2_r3-robolectric-r0.jar',
      '5e63d4c7f2c691afed648bf0675e0b0a76d19f0e23d93705f4faf9ed3b2734de',
    ],
  ];
  for (const [name, url, digest] of artifacts) {
    const path = join(cache, name);
    if (!existsSync(path)) {
      const response = await fetch(url, { signal: AbortSignal.timeout(120000), redirect: 'error' });
      if (!response.ok) throw new Error(`Provided Android artifact unavailable: ${name}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (createHash('sha256').update(bytes).digest('hex') !== digest)
        throw new Error(`Artifact digest mismatch: ${name}`);
      writeFileSync(path, bytes);
    }
    if (createHash('sha256').update(readFileSync(path)).digest('hex') !== digest)
      throw new Error(`Cached artifact digest mismatch: ${name}`);
  }
  const google = join(cache, 'install-referrer-classes.jar');
  writeFileSync(
    google,
    execFileSync('unzip', ['-p', join(cache, artifacts[0][0]), 'classes.jar'], {
      maxBuffer: 1000000,
    }),
  );
  const javaHome = process.env.REDIRECT_JAVA_HOME || process.env.JAVA_HOME;
  const tool = (name) => (javaHome ? join(javaHome, 'bin', name) : name);
  const dependencies = readFileSync(join(sdk, 'target/contract-classpath.txt'), 'utf8').trim();
  const classes = join(target, 'classes');
  rmSync(classes, { recursive: true, force: true });
  mkdirSync(classes, { recursive: true });
  const classpath = [
    join(sdk, 'target/classes'),
    dependencies,
    google,
    join(cache, artifacts[1][0]),
  ].join(delimiter);
  const sources = join(sdk, 'platform/src/main/java/guide/queer/redirects');
  execFileSync(
    tool('javac'),
    [
      '--release',
      '8',
      '-Xlint:all,-options',
      '-Werror',
      '-classpath',
      classpath,
      '-d',
      classes,
      ...readdirSync(sources)
        .filter((file) => file.endsWith('.java'))
        .map((file) => join(sources, file)),
    ],
    { stdio: 'inherit', timeout: 60000 },
  );
  execFileSync(
    tool('jar'),
    ['cf', join(target, 'redirects-play-install.jar'), '-C', classes, '.'],
    { stdio: 'inherit', timeout: 30000 },
  );
  const runtime = [
    classes,
    join(sdk, 'target/classes'),
    join(sdk, 'target/test-classes'),
    dependencies,
    google,
    join(cache, artifacts[1][0]),
  ].join(delimiter);
  if (tests) {
    const source = join(
      sdk,
      'platform/src/test/java/guide/queer/redirects/PlatformContractTests.java',
    );
    const testClasses = join(target, 'test-classes');
    mkdirSync(testClasses, { recursive: true });
    execFileSync(
      tool('javac'),
      [
        '--release',
        '8',
        '-Xlint:all,-options',
        '-Werror',
        '-classpath',
        runtime,
        '-d',
        testClasses,
        source,
      ],
      { stdio: 'inherit', timeout: 60000 },
    );
    return [testClasses, runtime].join(delimiter);
  }
  return runtime;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await buildAndroidPlatform();
