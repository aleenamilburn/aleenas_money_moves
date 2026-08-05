import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEVOTIONAL_TRANSLATION,
  DEVOTIONAL_TRANSLATION_ATTRIBUTION,
  FAITH_MONEY_DEVOTIONALS,
  validateFaithMoneyDevotionalLibrary
} from '../js/content/faithMoneyDevotionals.js';

test('the Faith & Money library is complete, original static WEB content', () => {
  assert.doesNotThrow(() => validateFaithMoneyDevotionalLibrary());
  assert.equal(DEVOTIONAL_TRANSLATION, 'WEB');
  assert.match(DEVOTIONAL_TRANSLATION_ATTRIBUTION, /public domain/i);
  assert.equal(FAITH_MONEY_DEVOTIONALS.length, 12);
  assert.equal(new Set(FAITH_MONEY_DEVOTIONALS.map(item => item.id)).size, 12);
  assert.equal(new Set(FAITH_MONEY_DEVOTIONALS.map(item => item.verseReference)).size, 12);
  for (const devotional of FAITH_MONEY_DEVOTIONALS) {
    const words = devotional.devotionalText.trim().split(/\s+/).length;
    assert.ok(words >= 350 && words <= 650, `${devotional.id} is ${words} words`);
    assert.equal(devotional.prompts.length, 3);
    assert.equal(new Set(devotional.prompts.map(prompt => prompt.id)).size, 3);
    assert.equal(/https?:\/\//i.test(JSON.stringify(devotional)), false);
    assert.equal(/Joyce\s+Meyer/i.test(JSON.stringify(devotional)), false);
  }
});
