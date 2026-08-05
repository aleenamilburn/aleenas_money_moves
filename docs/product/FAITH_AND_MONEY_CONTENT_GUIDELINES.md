# Faith & Money Content Guidelines

## Ownership and review

Faith & Money reflections and prompts are original Money Moves product writing. Contributors must not copy, paraphrase closely, scrape, or imitate a pastor, ministry, sermon, book, article, or published devotional. Do not imply endorsement by a pastor or ministry. New or revised content is reviewed as static application content before it is committed.

## Scripture policy

Phase 1 uses the World English Bible (`WEB`) consistently. The WEB is public domain; each devotional records its translation identifier, reference, exact quoted text, and the attribution `World English Bible (WEB), public domain.` See the [WEB copyright notice](https://ebible.org/engwebp/copyright.htm). Do not silently mix translations. Any change of translation requires an explicit product/content review and an updated attribution policy.

## Tone and safeguards

Content is Christian, compassionate, practical, and non-shaming. It may invite reflection on stewardship, trust, anxiety, debt, generosity, honesty, enoughness, and comparison. It must not promise prosperity, equate wealth with faithfulness or poverty with moral failure, guarantee financial outcomes, condemn a user for debt, diagnose spiritual or mental-health conditions, offer individualized financial/legal/medical/pastoral advice, use fear to manipulate, or introduce partisan/denominational disputes unnecessary to the reflection.

## Versioning and privacy

Static devotionals live in `js/content/faithMoneyDevotionals.js`, have immutable IDs and a content version, and are validated by `pnpm run content:validate`. The library never contains user journal material, remote URLs, executable content, or personal financial data. A journal entry keeps the content version that was current when it was first saved, so a future wording update does not silently rewrite the historical context of a response. User writing exists only in the encrypted vault.
