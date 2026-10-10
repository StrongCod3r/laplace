import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';

function fakeClock() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  return {
    now: () => now,
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, due: now + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    async advance(target, suspended = false) {
      if (suspended) now = target;
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
        if (!next || next[1].due > target) break;
        now = Math.max(now, next[1].due);
        timers.delete(next[0]);
        next[1].callback();
        await flush();
      }
      now = target;
      await flush();
    },
    flush,
  };
}

test('automation preserves deadlines through blocked checks, wakeups, long jobs and suspension', async () => {
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, watch: null, hmr: { server: createHttpServer() } },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { startGitAutomationSchedule } = await server.ssrLoadModule(
      '/src/features/git/services/git-automation-schedule.ts',
    );
    const clock = fakeClock();
    let blocked = true;
    let finishFirst;
    const executions = [];
    const schedule = startGitAutomationSchedule(
      60_000,
      async () => {
        if (blocked) return false;
        executions.push(clock.now());
        if (executions.length === 1)
          await new Promise((resolve) => {
            finishFirst = resolve;
          });
        return true;
      },
      clock,
    );
    await clock.advance(20_000);
    schedule.wake();
    await clock.advance(40_000);
    schedule.wake();
    await clock.advance(59_999);
    assert.deepEqual(executions, []);
    await clock.advance(60_000);
    await clock.advance(60_050);
    blocked = false;
    schedule.wake();
    await clock.advance(60_050);
    assert.deepEqual(executions, [60_050]);
    schedule.wake();
    await clock.advance(85_000);
    assert.equal(executions.length, 1);
    finishFirst();
    await clock.flush();
    await clock.advance(119_999);
    assert.equal(executions.length, 1);
    await clock.advance(120_000);
    assert.deepEqual(executions, [60_050, 120_000]);
    await clock.advance(245_000, true);
    assert.deepEqual(executions, [60_050, 120_000, 245_000]);
    await clock.advance(299_999);
    assert.equal(executions.length, 3);
    await clock.advance(300_000);
    assert.equal(executions.at(-1), 300_000);
    blocked = true;
    await clock.advance(360_000);
    await clock.advance(360_500);
    blocked = false;
    await clock.advance(361_000);
    assert.equal(executions.at(-1), 361_000);
    schedule.dispose();
    schedule.wake();
    await clock.advance(600_000);
    assert.equal(executions.length, 5);
  } finally {
    await server.close();
  }
});
