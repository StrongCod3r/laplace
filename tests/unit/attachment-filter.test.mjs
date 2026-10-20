import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('../../src/features/attachments/services/filter-attachments.ts', import.meta.url),
  'utf8',
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { filterAttachments } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

const items = Array.from({ length: 30 }, (_, index) => ({
  path: `.attachments/nested/asset-${String(index).padStart(2, '0')}.pdf`,
}));

test('regex filters the full attachment list by path, case-insensitively', () => {
  const result = filterAttachments(items, 'NESTED/asset-(00|29)\\.pdf$');
  assert.deepEqual(result.items, [items[0], items[29]]);
  assert.equal(result.error, '');
  assert.deepEqual(filterAttachments(items, 'missing').items, []);
  assert.equal(filterAttachments(items, '').items, items);
});

test('invalid patterns return a recoverable validation error', () => {
  assert.deepEqual(filterAttachments(items, '['), {
    items: [],
    error: 'Invalid regular expression',
  });
  assert.equal(filterAttachments(items, '\\.pdf$').items.length, 30);
});
