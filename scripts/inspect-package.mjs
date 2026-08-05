import fs from 'node:fs/promises';
import path from 'node:path';
import {extractFile, listPackage} from '@electron/asar';

const root = path.resolve(process.argv[2] || 'out');
const forbiddenSegments = new Set(['test', 'docs', 'supabase', '.git', '.agents', '.codex', '.claude', '.pnpm-store', '__pycache__']);
const forbiddenNames = new Set(['sample-transactions.csv', 'config.js', 'config.example.js']);

async function walk(directory, files = []) {
  const entries = await fs.readdir(directory, {withFileTypes:true});
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(target, files);
    else files.push(target);
  }
  return files;
}

try {
  const files = await walk(root);
  const violations = files.filter(file => {
    const parts = path.relative(root, file).split(path.sep);
    return parts.some(part => forbiddenSegments.has(part)) || forbiddenNames.has(path.basename(file)) || file.endsWith('.map');
  });
  const archives = files.filter(file => path.basename(file) === 'app.asar');
  if (!archives.length) violations.push('missing packaged app.asar');
  let archiveFileCount = 0;
  for (const archive of archives) {
    const entries = listPackage(archive, {isPack:true}).map(line => line.replace(/^pack\s+:\s+/, '').replace(/^\//, ''));
    archiveFileCount += entries.length;
    for (const entry of entries) {
      const parts = entry.split('/');
      if (parts.some(part => forbiddenSegments.has(part)) || forbiddenNames.has(path.basename(entry)) || entry.endsWith('.map')) {
        violations.push(`app.asar:${entry}`);
      }
    }
    if (!entries.includes('data.js')) violations.push('missing packaged data.js');
    else {
      const content = extractFile(archive, 'data.js').toString('utf8');
      if (!content.includes('MONEY_MOVES_SEED') || /"transactions"\s*:\s*\[\s*\{/.test(content)) violations.push('packaged data.js contains a populated transaction seed');
    }
  }
  if (violations.length) throw new Error(`Unsafe packaged content: ${violations.join(', ')}`);
  process.stdout.write(`Package content inspection passed (${files.length} files and ${archiveFileCount} archive entries scanned).\n`);
} catch (error) {
  process.stderr.write(`Package content inspection failed: ${error.message}\n`);
  process.exitCode = 1;
}
