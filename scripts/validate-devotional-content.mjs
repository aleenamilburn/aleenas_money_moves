import {validateFaithMoneyDevotionalLibrary} from '../js/content/faithMoneyDevotionals.js';

try {
  const validation = validateFaithMoneyDevotionalLibrary();
  if (!validation.ok) throw new Error(validation.errors.join(' '));
  process.stdout.write('Faith & Money devotional content validation passed.\n');
} catch (error) {
  process.stderr.write(`Faith & Money devotional content validation failed: ${error.message}\n`);
  process.exitCode = 1;
}
