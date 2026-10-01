import { execSync } from 'node:child_process';

/** Brings the test database up to the latest migration once per run (tests truncate tables themselves). */
export default function setup() {
  execSync('pnpm exec prisma migrate deploy', { stdio: 'inherit', env: { ...process.env } });
}
