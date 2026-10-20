import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { createPageGraph } = await loadModule('../../src/features/graph/services/model.ts');
function graph(count, edges = [], parents = {}) {
  return createPageGraph(
    Array.from({ length: count }, (_, index) => ({
      id: String(index),
      title: `Note ${index}`,
      current: false,
      parentId: parents[index] || null,
    })),
    edges,
  );
}

test('real ownership creates hierarchy edges without turning references into children', () => {
  const model = graph(
    5,
    [
      { source: '1', target: '0' },
      { source: '2', target: '4' },
    ],
    { 1: '0', 2: '0', 3: '2' },
  );
  assert.equal(model.nodes[0].childCount, 2);
  assert.equal(model.nodes[2].childCount, 1);
  assert.equal(model.nodes[3].depth, 2);
  assert.equal(model.nodes[3].rootId, '0');
  assert.equal(model.nodes[4].parentId, null);
  assert.equal(model.edges.filter((edge) => edge.kind === 'hierarchy').length, 3);
  assert.deepEqual(
    model.edges.filter((edge) => edge.kind === 'link'),
    [{ source: '2', target: '4', kind: 'link' }],
  );
  const broken = graph(4, [], { 0: '1', 1: '0', 2: 'missing', 3: '3' });
  assert.ok(broken.nodes.every((node) => Number.isFinite(node.depth) && node.rootId));
  assert.equal(broken.nodes[2].parentId, null);
  assert.equal(broken.nodes[3].parentId, null);
});
