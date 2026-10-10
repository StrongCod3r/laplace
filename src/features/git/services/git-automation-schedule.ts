interface ScheduleClock {
  now(): number;
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(timer: number): void;
}

/** A false result defers a due check without moving its scheduled deadline. */
export function startGitAutomationSchedule(
  intervalMs: number,
  run: () => Promise<boolean>,
  clock: ScheduleClock = {
    now: () => Date.now(),
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: (timer) => window.clearTimeout(timer),
  },
) {
  let nextDue = clock.now() + intervalMs;
  let timer: number | undefined;
  let stopped = false;
  let running = false;

  function schedule(delay: number) {
    if (stopped) return;
    if (timer !== undefined) clock.clearTimeout(timer);
    timer = clock.setTimeout(
      () => {
        timer = undefined;
        void check();
      },
      Math.max(0, delay),
    );
  }

  async function check() {
    if (stopped || running) return;
    const remaining = nextDue - clock.now();
    if (remaining > 0) {
      schedule(remaining);
      return;
    }
    running = true;
    let completed = false;
    try {
      completed = await run();
    } finally {
      running = false;
      if (completed) {
        // Keep the original cadence, including after slow operations or a suspended browser.
        const elapsedSlots = Math.floor(Math.max(0, clock.now() - nextDue) / intervalMs) + 1;
        nextDue += elapsedSlots * intervalMs;
      }
      schedule(completed ? nextDue - clock.now() : 1000);
    }
  }

  schedule(intervalMs);
  return {
    wake() {
      if (!stopped && !running) schedule(Math.max(0, nextDue - clock.now()));
    },
    dispose() {
      stopped = true;
      if (timer !== undefined) clock.clearTimeout(timer);
    },
  };
}
