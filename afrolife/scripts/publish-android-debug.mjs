import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const appDirectory = path.resolve(import.meta.dirname, '..');
const versionFile = path.join(appDirectory, 'android', 'app', 'version.properties');
const versionProperties = readFileSync(versionFile, 'utf8');
const versionCode = versionProperties.match(/^versionCode=(\d+)$/m)?.[1];
const versionName = versionProperties.match(/^versionName=([0-9A-Za-z.-]+)$/m)?.[1];

if (!versionCode || !versionName) {
  throw new Error(`Missing valid versionCode or versionName in ${versionFile}`);
}

const localAppData = process.env.LOCALAPPDATA
  || path.join(os.homedir(), 'AppData', 'Local');
const builtApk = path.join(
  localAppData,
  'AfroLife',
  'android-build',
  '_app',
  'outputs',
  'apk',
  'debug',
  'app-debug.apk'
);

if (!existsSync(builtApk)) {
  throw new Error(`Gradle completed but the expected APK was not found: ${builtApk}`);
}

const artifactDirectory = path.join(appDirectory, 'artifacts');
const versionedApk = path.join(
  artifactDirectory,
  `AfroLife-Agency-${versionName}-debug.apk`
);
const latestApk = path.join(
  artifactDirectory,
  'AfroLife-Agency-debug-latest.apk'
);
const legacyLatestApk = path.join(
  artifactDirectory,
  'AfroLife-Agency-1.0-debug-latest.apk'
);

mkdirSync(artifactDirectory, { recursive: true });
copyFileSync(builtApk, versionedApk);
copyFileSync(builtApk, latestApk);
copyFileSync(builtApk, legacyLatestApk);

console.log(`Published version ${versionName} (versionCode ${versionCode}):`);
console.log(versionedApk);
console.log(latestApk);
console.log(legacyLatestApk);
