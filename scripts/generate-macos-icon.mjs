import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'assets/brand/money-moves-mark.png');
const pngDirectory = path.join(root, 'assets/icons/png');
const icnsDirectory = path.join(root, 'assets/icons/macos');
const icnsOutput = path.join(icnsDirectory, 'icon.icns');
const sizes = [16, 32, 64, 128, 256, 512, 1024];
const icnsRepresentations = new Map([
  [16, 'icp4'],
  [32, 'icp5'],
  [64, 'icp6'],
  [128, 'ic07'],
  [256, 'ic08'],
  [512, 'ic09'],
  [1024, 'ic10']
]);

if (process.platform !== 'darwin') throw new Error('macOS is required to generate the .icns file.');
await fs.mkdir(pngDirectory, {recursive:true});
await fs.mkdir(icnsDirectory, {recursive:true});
for (const size of sizes) {
  const output = path.join(pngDirectory, `${size}.png`);
  const result = spawnSync('sips', ['-z', String(size), String(size), source, '--out', output], {encoding:'utf8'});
  if (result.status !== 0) throw new Error(result.stderr || `sips failed while creating ${output}`);
}
const chunks = [];
for (const [size, type] of icnsRepresentations) {
  const png = await fs.readFile(path.join(pngDirectory, `${size}.png`));
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, 'ascii');
  header.writeUInt32BE(png.length + 8, 4);
  chunks.push(header, png);
}
const header = Buffer.alloc(8);
header.write('icns', 0, 4, 'ascii');
header.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4);
await fs.writeFile(icnsOutput, Buffer.concat([header, ...chunks]));
