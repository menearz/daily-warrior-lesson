import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dest = path.join(root, 'www');

const files = [
  'index.html',
  'forge.html',
  'archive.html',
  'privacy.html',
  'lessons.json',
  'manifest.json',
  'sw.js',
  'icon.svg',
  'icon.png',
  'forge-unlock.js'
];

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

for (const name of files) {
  const from = path.join(root, name);
  if (!fs.existsSync(from)) {
    throw new Error('prepare-www: missing ' + name);
  }
  fs.copyFileSync(from, path.join(dest, name));
}

console.log('Copied ' + files.length + ' files to www/');
