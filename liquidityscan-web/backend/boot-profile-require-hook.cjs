/**
 * Optional deep instrumentation: logs every require() call with timing.
 * Wraps Node's Module._load to capture cumulative time per top-level module.
 *
 * Activated by passing --require ./boot-profile-require-hook.cjs to node.
 * Default deploy does NOT activate this — only if first-pass profiling
 * (boot-profile.ts checkpoints) shows imports as the bottleneck and we
 * need per-module granularity.
 *
 * To enable for one boot:
 *   1. Edit ecosystem.config.cjs node_args: '--require ./boot-profile-require-hook.cjs'
 *   2. pm2 delete liquidityscan-api && pm2 start ecosystem.config.cjs
 *   3. Observe BOOT_REQUIRE log lines in pm2 out log
 *   4. After capturing data, revert ecosystem.config.cjs (DO NOT leave in prod)
 *
 * Output format: [BOOT_REQUIRE] +Tms cumulative=Cms <module-id>
 *   T = wall-clock since first require
 *   C = cumulative time spent loading THIS module (including its sub-requires)
 */

const Module = require('module');
const originalLoad = Module._load;
const PROFILE_START_MS = Date.now();
const stack = [];

Module._load = function (request, parent, isMain) {
  const startMs = Date.now();
  stack.push({ request, startMs, childMs: 0 });

  const result = originalLoad.apply(this, arguments);

  const frame = stack.pop();
  const totalMs = Date.now() - frame.startMs;
  const selfMs = totalMs - frame.childMs;

  // Add to parent's childMs accumulator
  if (stack.length > 0) {
    stack[stack.length - 1].childMs += totalMs;
  }

  // Filter: log only top-level (depth 0) and slow modules (>50ms self time)
  const depth = stack.length;
  const elapsed = Date.now() - PROFILE_START_MS;

  if (depth === 0) {
    process.stderr.write(
      `[BOOT_REQUIRE] +${elapsed}ms total=${totalMs}ms self=${selfMs}ms ${request}\n`
    );
  } else if (selfMs > 50) {
    process.stderr.write(
      `[BOOT_REQUIRE]   +${elapsed}ms (depth=${depth}) self=${selfMs}ms ${request}\n`
    );
  }

  return result;
};

process.stderr.write(`[BOOT_REQUIRE] hook installed at ${PROFILE_START_MS}\n`);
