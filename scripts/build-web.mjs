import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dist = resolve(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, 'icons'), { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'sw.js']) {
  await cp(resolve(root, file), resolve(dist, file));
}
for (const file of ['icon-192.png', 'icon-512.png']) {
  await cp(resolve(root, 'icons', file), resolve(dist, 'icons', file));
}
console.log('web assets copied to ' + dist);
