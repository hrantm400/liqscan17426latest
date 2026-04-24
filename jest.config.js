/** Root jest config — covers the small pure-function tests under /tests.
 *  Frontend/backend packages have their own test setups; this config only
 *  picks up files matching tests/**\/*.test.(js|ts).
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.(js|ts)'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        // The frontend's `tsc --noEmit -p tsconfig.app.json` is the source of
        // truth for type-checking. ts-jest only needs to *transform* TS to JS
        // for the test runtime — type errors in transitive imports
        // (e.g. drawCisdOverlays.ts ↔ lightweight-charts type mismatches that
        // pre-date this test infra) shouldn't block test execution.
        diagnostics: false,
        tsconfig: { target: 'es2020', module: 'commonjs', esModuleInterop: true, strict: true, isolatedModules: true },
      },
    ],
  },
};
