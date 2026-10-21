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

test('file patterns filter the full list by filename or path, case-insensitively', () => {
  const result = filterAttachments(items, 'NESTED/asset-2?.PDF');
  assert.deepEqual(result.items, items.slice(20));
  assert.equal(result.error, '');
  assert.deepEqual(filterAttachments(items, 'missing').items, []);
  assert.equal(filterAttachments(items, '').items, items);
  assert.equal(filterAttachments(items, '*.pdf').items.length, 30);
  assert.equal(filterAttachments(items, 'asset-00.pdf').items.length, 1);
});

test('SVG patterns match only the extension, including nested files', () => {
  const files = [
    'icon.svg',
    'nested/ICON.SVG',
    'icon.svg.png',
    'iconsvg',
    'icon.svg/other.png',
  ].map((path) => ({ path: `.attachments/${path}` }));
  assert.deepEqual(filterAttachments(files, '*.svg').items, files.slice(0, 2));
});

test('wildcards respect path segments and double stars include subfolders', () => {
  const files = ['images/a.svg', 'images/deep/b.svg', 'other/a.svg'].map((path) => ({
    path: `.attachments/${path}`,
  }));
  assert.deepEqual(filterAttachments(files, 'images/*.svg').items, [files[0]]);
  assert.deepEqual(filterAttachments(files, 'images/**/*.svg').items, files.slice(0, 2));
  assert.deepEqual(filterAttachments(files, '.attachments/**').items, files);
});

test('regular expression punctuation is literal and never causes a validation error', () => {
  for (const name of ['[draft].svg', 'a+b.svg', '(icon).svg', 'file$.svg', 'a^b.svg', 'a|b.svg']) {
    const files = [{ path: `.attachments/${name}` }];
    assert.deepEqual(filterAttachments(files, name), { items: files, error: '' });
  }
  assert.deepEqual(filterAttachments(items, '['), { items: [], error: '' });
});

test('semicolon-separated patterns match any format once and ignore empty entries', () => {
  const files = ['icon.svg', 'nested/PHOTO.PNG', 'note.pdf', 'icon.svg.bak', 'photo.png.bak'].map(
    (path) => ({ path: `.attachments/${path}` }),
  );
  assert.deepEqual(filterAttachments(files, '*.svg;*.png').items, files.slice(0, 2));
  assert.deepEqual(filterAttachments(files, ' ; *.SVG ;; *.png; *.svg; ').items, files.slice(0, 2));
  assert.deepEqual(filterAttachments(files, 'nested/*.png;icon.svg').items, files.slice(0, 2));
  assert.equal(filterAttachments(files, ' ; ; ').items, files);
});
