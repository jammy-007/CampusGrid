import { defineConfig } from 'vitest/config';

/** Tests run against a separate database: TEST_DATABASE_URL, or DATABASE_URL with "_test" appended to the db name. */
function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('Set DATABASE_URL (copy .env.example to .env) before running API tests');
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/\/$/, '')}_test`;
  return url.toString();
}

const databaseUrl = testDatabaseUrl();
process.env.DATABASE_URL = databaseUrl;

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    env: { DATABASE_URL: databaseUrl, JWT_SECRET: 'test-secret', NODE_ENV: 'test' },
    // Test files share one database; run them one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
