import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];
const destination = path.join(root, 'assets', 'brand', 'money-moves-mark.png');
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

if (!source) throw new Error('Pass the founder PNG path as the first argument.');

const original = await fs.readFile(source);
if (!original.subarray(0, pngSignature.length).equals(pngSignature)) {
  throw new Error('Founder icon is not a PNG document.');
}

let offset = pngSignature.length;
let ihdr;
const pixelChunks = [];
while (offset < original.length) {
  if (offset + 12 > original.length) throw new Error('Founder PNG has a truncated chunk.');
  const length = original.readUInt32BE(offset);
  const end = offset + 12 + length;
  if (end > original.length) throw new Error('Founder PNG has an invalid chunk length.');
  const type = original.subarray(offset + 4, offset + 8).toString('ascii');
  const chunk = original.subarray(offset, end);
  if (type === 'IHDR') ihdr = original.subarray(offset + 8, offset + 8 + length);
  if (['IHDR', 'IDAT', 'IEND'].includes(type)) pixelChunks.push(chunk);
  offset = end;
}

if (!ihdr || ihdr.length !== 13 || !pixelChunks.length || !pixelChunks.at(-1).subarray(4, 8).equals(Buffer.from('IEND'))) {
  throw new Error('Founder PNG is missing required image chunks.');
}
const width = ihdr.readUInt32BE(0);
const height = ihdr.readUInt32BE(4);
if (width !== height || width < 1024 || ihdr[8] !== 8 || ihdr[9] !== 6) {
  throw new Error('Founder PNG must be a square 8-bit RGBA image at least 1024 pixels wide.');
}

// Retain only raster pixel chunks. This removes C2PA, EXIF, and text metadata
// while preserving the founder-approved pixels and alpha channel exactly.
const sanitized = Buffer.concat([pngSignature, ...pixelChunks]);

await fs.mkdir(path.dirname(destination), {recursive:true});
await fs.writeFile(destination, sanitized);
process.stdout.write(`Installed sanitized ${width}×${height} founder PNG at ${path.relative(root, destination)}.\n`);
