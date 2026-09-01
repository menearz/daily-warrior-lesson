import fs from 'node:fs';
import path from 'node:path';

const androidDir = path.resolve(import.meta.dirname, '..', 'android');
const dest = path.join(androidDir, 'local.properties');
const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;

if (!fs.existsSync(androidDir)) {
  console.log('android/ not present yet; skip local.properties');
  process.exit(0);
}

if (!sdk) {
  console.log('ANDROID_SDK_ROOT / ANDROID_HOME unset; Gradle may still use a default SDK.');
  process.exit(0);
}

const line = 'sdk.dir=' + sdk.replace(/\\/g, '/');
fs.writeFileSync(dest, line + '\n');
console.log('Wrote android/local.properties -> ' + sdk);
