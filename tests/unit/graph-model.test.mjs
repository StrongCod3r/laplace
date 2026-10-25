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
const { GraphFamilyColors } = await loadModule(
  '../../src/features/graph/services/family-colors.ts',
);
const { createFamilyRegions, graphNodeRadius } = await loadModule(
  '../../src/features/graph/services/family-regions.ts',
);
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

test('disconnected families with colliding ID hashes receive distinct colors', () => {
  const model = createPageGraph(
    [
      { id: 'Aa', parentId: null },
      { id: 'BB', parentId: null },
      { id: 'child-a', parentId: 'Aa' },
      { id: 'child-b', parentId: 'BB' },
    ].map((page) => ({ ...page, title: page.id, current: false })),
    [],
  );
  const palette = new GraphFamilyColors();
  palette.update(model.nodes.map((node) => node.rootId));
  assert.notEqual(palette.color('Aa'), palette.color('BB'));
  for (const node of model.nodes)
    assert.equal(palette.color(node.rootId), palette.color(node.parentId || node.id));
  const reversed = new GraphFamilyColors();
  reversed.update(model.nodes.toReversed().map((node) => node.rootId));
  for (const node of model.nodes)
    assert.equal(reversed.color(node.rootId), palette.color(node.rootId));
});

test('family colors stay stable through metadata changes, additions and removal', () => {
  const palette = new GraphFamilyColors();
  palette.update(['a', 'b', 'c']);
  const baseline = ['a', 'b', 'c'].map((id) => palette.color(id));
  palette.update(['c', 'b', 'a', 'b']);
  palette.update(['a', 'c', 'd']);
  palette.update(['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(
    ['a', 'b', 'c'].map((id) => palette.color(id)),
    baseline,
  );
  assert.equal(new Set(['a', 'b', 'c', 'd', 'e'].map((id) => palette.color(id))).size, 5);
});

test('family circles enclose every member and follow moved nodes without mutating the model', () => {
  const model = graph(5, [{ source: '2', target: '3' }], { 1: '0', 2: '0', 4: '3' });
  const nodes = model.nodes.map((node, index) => ({ ...node, x: index * 80, y: index * -25 }));
  const baseline = structuredClone(nodes);
  const regions = createFamilyRegions(nodes);
  assert.deepEqual(
    regions.map((region) => region.rootId),
    ['0', '3'],
  );
  assert.equal(regions[0].title, 'Note 0');
  assert.equal(regions[0].nodes.length, 3);
  for (const region of regions)
    for (const node of region.nodes)
      assert.ok(
        Math.hypot(node.x - region.x, node.y - region.y) + graphNodeRadius(node) + 35 <
          region.radius,
      );
  assert.deepEqual(nodes, baseline);
  nodes[2].x += 500;
  assert.ok(createFamilyRegions(nodes)[0].radius > regions[0].radius);
});

test('isolated notes and uninitialized coordinates do not create family circles', () => {
  const model = graph(4, [{ source: '0', target: '1' }], { 3: '2' });
  assert.deepEqual(createFamilyRegions(model.nodes), []);
  const nodes = model.nodes.map((node) => ({ ...node, x: 0, y: 0 }));
  nodes[3].x = NaN;
  assert.deepEqual(createFamilyRegions(nodes), []);
  nodes[3].x = 20;
  assert.deepEqual(
    createFamilyRegions(nodes).map((region) => region.rootId),
    ['2'],
  );
});
