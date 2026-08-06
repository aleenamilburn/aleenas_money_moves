import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEVOTIONAL_TRANSLATION,
  DEVOTIONAL_TRANSLATION_ATTRIBUTION,
  FAITH_MONEY_DEVOTIONALS,
  validateFaithMoneyDevotionalLibrary
} from '../js/content/faithMoneyDevotionals.js';

test('the Faith & Money library is complete, original static WEB content', () => {
  assert.equal(validateFaithMoneyDevotionalLibrary().ok, true);
  assert.equal(DEVOTIONAL_TRANSLATION, 'WEB');
  assert.match(DEVOTIONAL_TRANSLATION_ATTRIBUTION, /public domain/i);
  assert.equal(FAITH_MONEY_DEVOTIONALS.length, 12);
  assert.equal(new Set(FAITH_MONEY_DEVOTIONALS.map(item => item.id)).size, 12);
  assert.equal(new Set(FAITH_MONEY_DEVOTIONALS.map(item => item.verseReference)).size, 12);
  assert.equal(FAITH_MONEY_DEVOTIONALS.find(item => item.id === 'faith-money-comparison').verseText,
    'But let each man examine his own work, and then he will have reason to boast in himself, and not in someone else. For each man will bear his own burden.');
  for (const devotional of FAITH_MONEY_DEVOTIONALS) {
    const words = devotional.devotionalText.trim().split(/\s+/).length;
    assert.ok(words >= 350 && words <= 650, `${devotional.id} is ${words} words`);
    assert.equal(devotional.prompts.length, 3);
    assert.equal(new Set(devotional.prompts.map(prompt => prompt.id)).size, 3);
    assert.equal(/https?:\/\//i.test(JSON.stringify(devotional)), false);
    assert.equal(/Joyce\s+Meyer/i.test(JSON.stringify(devotional)), false);
  }
});

test('the devotional validator rejects altered attribution and executable or remote content', () => {
  const invalid = structuredClone(FAITH_MONEY_DEVOTIONALS);
  invalid[0].translationAttribution = 'Different attribution';
  invalid[0].optionalClosingReflection = '<img src="https://example.test/image" onerror="alert(1)">';
  const validation = validateFaithMoneyDevotionalLibrary(invalid);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join(' '), /required WEB attribution/);
  assert.match(validation.errors.join(' '), /prohibited executable or remote content/);
});

test('the devotional validator rejects overlapping primary passages', () => {
  const invalid = structuredClone(FAITH_MONEY_DEVOTIONALS);
  invalid[10].verseReference = '2 Corinthians 9:7–8';
  const validation = validateFaithMoneyDevotionalLibrary(invalid);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join(' '), /Duplicate primary passage/);
});
