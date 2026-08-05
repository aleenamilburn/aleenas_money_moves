import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root), 'utf8');

test('Faith & Money reader contract exposes accessible overview, journal, history, and compact-layout hooks', () => {
  const html = read('index.html');
  const app = read('js/app.js');
  const css = read('app.css');
  for (const id of [
    'faithMoneyCard', 'openActiveDevotional', 'screen-devotionals', 'devotionalReaderTitle',
    'devotionalPrompts', 'devotionalPrivateNotes', 'saveDevotionalProgress',
    'completeDevotional', 'advanceDevotional', 'devotionalLibrary', 'returnToOverview'
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /aria-live="polite"/);
  assert.match(app, /function openDevotionalReader/);
  assert.match(app, /function discardDevotionalDraft/);
  assert.match(app, /saveDevotionalResponses/);
  assert.match(app, /completeDevotional/);
  assert.match(app, /advanceToNextDevotional/);
  assert.match(css, /\.devotional-layout/);
  assert.match(css, /\.devotional-prompts/);
  assert.match(css, /@media\(max-width:760px\).*\.devotional-actions/s);
});
