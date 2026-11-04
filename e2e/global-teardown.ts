import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const PIDFILE = join(__dirname, '..', 'node_modules', '.cache', 'lightpanda.pid');

export default async function globalTeardown(): Promise<void> {
  if (!existsSync(PIDFILE)) return;
  const pid = readFileSync(PIDFILE, 'utf8').trim();
  rmSync(PIDFILE, { force: true });
  if (!pid || pid === 'reused') return;
  try {
    process.kill(Number(pid), 'SIGTERM');
  } catch {
    // Already gone — fine.
  }
}
