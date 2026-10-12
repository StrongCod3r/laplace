import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

test('every migrated algorithm is registered and its runtime dependencies exist', () => {
  const inventory = JSON.parse(
    readFileSync(new URL('../../docs/migration-inventory.json', import.meta.url), 'utf8'),
  );
  const expected = Object.values(inventory.features).flat();
  assert.equal(expected.length, inventory.total);
  assert.equal(new Set(expected).size, inventory.total);
  const available = new Set([...expected, 'lifecycle', 'publish', 'deferPublication']);
  const controller = ts.createSourceFile(
    'controller.ts',
    readFileSync(
      new URL('../../src/features/editor/services/create-controller.ts', import.meta.url),
      'utf8',
    ),
    ts.ScriptTarget.Latest,
    true,
  );
  function visitController(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(controller) === 'Object.defineProperties'
    ) {
      for (const property of node.arguments[1].properties)
        available.add(property.name.getText(controller));
    }
    ts.forEachChild(node, visitController);
  }
  visitController(controller);
  for (const [feature, functions] of Object.entries(inventory.features)) {
    const source = ts.createSourceFile(
      `${feature}.ts`,
      readFileSync(
        new URL(`../../src/features/${feature}/services/register.ts`, import.meta.url),
        'utf8',
      ),
      ts.ScriptTarget.Latest,
      true,
    );
    const factory = source.statements.find(ts.isFunctionDeclaration);
    const actual = factory.body.statements
      .filter(ts.isFunctionDeclaration)
      .map((fn) => fn.name.text);
    assert.deepEqual(actual, functions, `${feature}: missing or reordered algorithm`);
    function visit(node) {
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'runtime'
      ) {
        assert.ok(
          available.has(node.name.text),
          `${feature}: unknown dependency runtime.${node.name.text}`,
        );
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
});
