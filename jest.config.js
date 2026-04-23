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
        tsconfig: { target: 'es2020', module: 'commonjs', esModuleInterop: true, strict: true },
      },
    ],
  },
};
