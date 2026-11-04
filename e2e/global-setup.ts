import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { LIGHTPANDA_CDP_URL } from './lightpanda-fixture';

// Starts `lightpanda serve` before the suite, unless a CDP server is already
// listening (then we reuse it and leave it running). Records what we started
// in a pidfile for global-teardown.

const PIDFILE = join(__dirname, '..', 'node_modules', '.cache', 'lightpanda.pid');

function bin(): string {
  if (process.env.LIGHTPANDA_BIN && existsSync(process.env.LIGHTPANDA_BIN)) {
    return process.env.LIGHTPANDA_BIN;
  }
  const local = join(homedir(), '.local', 'bin', 'lightpanda');
  if (existsSync(local)) return local;
  return 'lightpanda';
}

function httpUrl(): string {
  return LIGHTPANDA_CDP_URL.replace(/^ws/, 'http');
}

async function listening(): Promise<boolean> {
  try {
    const res = await fetch(`${httpUrl()}/json/version`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function globalSetup(): Promise<void> {
  if (await listening()) {
    mkdirSync(join(__dirname, '..', 'node_modules', '.cache'), { recursive: true });
    writeFileSync(PIDFILE, 'reused');
    return;
  }
  const url = new URL(LIGHTPANDA_CDP_URL);
  const proc = spawn(bin(), ['serve', '--host', url.hostname, '--port', url.port || '9222'], {
    stdio: 'ignore',
    detached: true,
  });
  proc.unref();
  for (let i = 0; i < 50; i++) {
    if (await listening()) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!(await listening())) throw new Error(`lightpanda serve did not come up at ${httpUrl()}`);
  mkdirSync(join(__dirname, '..', 'node_modules', '.cache'), { recursive: true });
  writeFileSync(PIDFILE, String(proc.pid ?? ''));
}
