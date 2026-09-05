// Runs the Gradle wrapper without caring which shell npm picked, and falls back
// to the JDK that ships with Android Studio when JAVA_HOME is not set.
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const isWin = process.platform === 'win32';
const androidDir = path.resolve('android');

if (!existsSync(androidDir)) {
  console.error('No android/ directory. Run: npx cap add android');
  process.exit(1);
}

// local.properties is machine-specific and git-ignored, so a fresh clone has
// none. Point it at wherever this machine keeps the SDK.
const localProps = path.join(androidDir, 'local.properties');
if (!existsSync(localProps)) {
  const sdk = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    isWin ? `${process.env.LOCALAPPDATA}/Android/Sdk` : null,
    path.join(os.homedir(), 'Library/Android/sdk'),
    path.join(os.homedir(), 'Android/Sdk'),
  ].find((p) => p && existsSync(p));

  if (!sdk) {
    console.error('Android SDK not found. Install it via Android Studio, or set ANDROID_HOME.');
    process.exit(1);
  }
  writeFileSync(localProps, `sdk.dir=${sdk.replace(/\\/g, '/')}\n`);
  console.log(`Wrote android/local.properties -> ${sdk}`);
}

const BUNDLED_JDKS = isWin
  ? [
      'C:/Program Files/Android/Android Studio/jbr',
      `${process.env.LOCALAPPDATA}/Programs/Android Studio/jbr`,
    ]
  : [
      '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
      '/opt/android-studio/jbr',
    ];

let javaHome = process.env.JAVA_HOME;
if (!javaHome || !existsSync(javaHome)) {
  javaHome = BUNDLED_JDKS.find((p) => existsSync(p));
  if (javaHome) console.log(`Using Android Studio's JDK: ${javaHome}`);
}
if (!javaHome) {
  console.error('No JDK found. Install Android Studio, or set JAVA_HOME to a JDK 17/21.');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) args.push('assembleDebug');

// Node refuses to spawn a .bat without a shell, so the wrapper is resolved
// relative to cwd and handed to the shell instead of being executed directly.
const wrapper = isWin
  ? `"${path.join(androidDir, 'gradlew.bat')}"`
  : `"${path.join(androidDir, 'gradlew')}"`;

const result = spawnSync(wrapper, args, {
  cwd: androidDir,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, JAVA_HOME: javaHome },
});

if (result.error) {
  console.error(`Could not run the Gradle wrapper: ${result.error.message}`);
  process.exit(1);
}

if (result.status === 0 && args.includes('assembleDebug')) {
  console.log('\nAPK: android/app/build/outputs/apk/debug/app-debug.apk');
}
process.exit(result.status ?? 1);
