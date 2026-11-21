import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = join(root, 'tmp');
mkdirSync(directory, { recursive: true });
const run = mkdtempSync(join(directory, 'hosted-'));
const work = join(run, 'source');
const release = join(run, 'deploy');
mkdirSync(work);
mkdirSync(release);

function copy(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true, filter: path => !/\.test\.tsx?$/.test(path) });
}

for (const path of ['src', 'shared', 'server', 'index.html', 'tsconfig.json', 'tsconfig.server.json', 'package.json']) {
  copy(join(root, path), join(work, path));
}
// Both bundles must resolve the same licensed photo, control geometry and authored menu.
for (const [file, destination] of Object.entries({
  'devices.ts': 'src/data/devices.ts', 'guides.ts': 'src/data/guides.ts',
  'registry.ts': 'src/data/presets/registry.ts', 'demo-guides.ts': 'src/data/presets/demo-guides.ts',
  'references.ts': 'server/references.ts',
})) copy(join(root, 'hosting/practice', file), join(work, destination));
copy(join(root, 'hosting/api.ts'), join(work, 'serverless/index.ts'));

for (const path of ['ingane.svg', 'fonts/noto-sans-malayalam.woff2', 'fonts/OFL.txt']) {
  copy(join(root, 'public', path), join(work, 'public', path));
}
const photo = join(root, 'hosting/media/coolux-practice.jpg');
const hash = createHash('sha256').update(readFileSync(photo)).digest('hex');
if (hash !== '99765fb9cd019e18bc538a166b820830a64a7064ae790185a68bce014fd7b007') {
  throw new Error('The public practice crop differs from the image used to measure its highlights.');
}
copy(photo, join(work, 'public/devices/coolux-practice.jpg'));
copy(join(root, 'hosting/media/photo-credit.txt'), join(work, 'public/photo-credit.txt'));
copy(join(root, 'hosting/demo/index.html'), join(work, 'public/demo/index.html'));
for (const file of ['ingane-demo.mp4', 'ingane-demo.en.vtt', 'demo-poster.jpg']) {
  copy(join(root, 'docs/media', file), join(work, 'public/demo', file));
}

const serverTypecheck = JSON.parse(readFileSync(join(work, 'tsconfig.server.json'), 'utf8'));
serverTypecheck.include = ['server', 'shared', 'serverless'];
writeFileSync(join(work, 'tsconfig.server.json'), JSON.stringify(serverTypecheck));
for (const config of ['tsconfig.json', 'tsconfig.server.json']) {
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', config], { cwd: work, stdio: 'inherit' });
}
const options = { root: work, configFile: false, envDir: false, mode: 'hosted' };
await build({ ...options, base: './', plugins: [react()], build: { outDir: join(release, 'dist') } });
await build({ ...options, build: {
  ssr: join(work, 'serverless/index.ts'), outDir: join(release, 'api'), copyPublicDir: false, minify: true,
  rolldownOptions: { output: { entryFileNames: 'index.mjs' } },
} });

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
delete pkg.scripts;
writeFileSync(join(release, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
copy(join(root, 'package-lock.json'), join(release, 'package-lock.json'));
copy(join(root, 'hosting/vercel.json'), join(release, 'vercel.json'));
console.log('Public deployment directory: ' + release);
