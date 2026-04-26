/**
 * Boot profiling helper — measures wall-clock time from process spawn
 * to each labeled checkpoint. Writes directly to stderr to bypass
 * NestJS bufferLogs and Pino, so timing is not distorted by the logger.
 *
 * Usage:
 *   import { bootProfile } from './common/boot-profile';
 *   bootProfile('main.ts loaded');
 *
 * PROCESS_SPAWN_MS captures the moment the Node process started, computed
 * via process.uptime() at the moment this module is first loaded. Slight
 * skew (~module-load ms) is acceptable since we're measuring 90s-scale phases.
 *
 * Disable via DISABLE_BOOT_PROFILE=1 env if needed (e.g. very noisy production).
 */

const PROCESS_SPAWN_MS = Date.now() - process.uptime() * 1000;
const ENABLED = process.env.DISABLE_BOOT_PROFILE !== '1';

export function bootProfile(label: string): void {
  if (!ENABLED) return;
  const elapsed = Date.now() - PROCESS_SPAWN_MS;
  process.stderr.write(`[BOOT_PROFILE] +${elapsed}ms ${label}\n`);
}

// Emit a marker on module load so we can see when this file itself was reached.
bootProfile('boot-profile module loaded');
