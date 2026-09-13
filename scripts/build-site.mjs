import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const site = path.join(root, 'site');
await mkdir(site, { recursive: true });
await copyFile(path.join(root, 'EF_SET_30日教材.html'), path.join(site, 'index.html'));
console.log('Site built: site/index.html');
